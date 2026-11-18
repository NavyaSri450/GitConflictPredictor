import { expect, test, type Page } from '@playwright/test';

const response = (prediction: 0 | 1, conflict: number) => ({
  prediction,
  prediction_label: prediction ? 'Merge conflict risk detected' : 'Clean merge estimate',
  predicted_class: prediction ? 'merge_conflict' : 'clean_merge',
  class_probabilities: { clean_merge: 1 - conflict, merge_conflict: conflict },
  probability_note: 'Test-only model response. These scores are uncalibrated.',
  model_name: 'random_forest',
  model_status: 'exploratory; not production validated',
  features_used: ['files_changed', 'lines_added', 'avg_files_per_commit', 'branch_commits', 'branch_files_changed'],
  predicted_at: '2026-11-14T10:00:00+00:00',
  message: 'Test fixture only; always review a merge using Git.',
});

const testAnalysis = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-analysis-0001', repository_id: 'test-repository-0001', repository_name: 'fixture-repository',
  source_branch: 'refs/remotes/origin/feature/example', target_branch: 'refs/remotes/origin/main',
  source_commit: 'a'.repeat(40), target_commit: 'b'.repeat(40), merge_base: 'c'.repeat(40),
  source_only_commits: 2, target_only_commits: 1, source_changed_files: ['shared.ts', 'source.ts'],
  target_changed_files: ['shared.ts', 'target.ts'], overlapping_paths: ['shared.ts'],
  source_lines_added: 12, source_lines_deleted: 2, target_lines_added: 4, target_lines_deleted: 1,
  feature_values: { files_changed: 2, lines_added: 12, commit_severity: null, developer_commits: null, avg_files_per_commit: 1.5, developer_conflicts: null, activity_score: null, import_count: null, dependency_conflicts: null, coverage: null, branch_commits: 1, branch_files_changed: 2, branch_conflicts: null, branch_risk_score: null, pattern_frequency: null, pattern_conflicts: null, dependency_risk: null, pattern_risk: null },
  merge_check: 'conflict', prediction: null, prediction_unavailable_reason: 'Model unavailable in test fixture.', created_at: '2026-11-18T10:00:00+00:00',
  ...overrides,
});

test.beforeEach(async ({ page }) => {
  const dataset = {
    status: 'available', validation_status: 'valid', raw_rows: 20, processed_rows: 20,
    feature_count: 18, provenance_count: 11, repository_group_count: 10,
    repository_distribution: [], class_counts: { '0': 10, '1': 10 },
    feature_aggregates: [], collection_timeline: [], raw_available: true, processed_available: true,
  };
  await page.route('**/api/v1/integration-status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ database_available: true, git_available: true, local_repository_connection_enabled: false, public_github_connection_enabled: true }) }));
  await page.route('**/api/v1/dashboard', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repository_count: 0, analysis_count: 0, clean_merge_checks: 0, conflicting_merge_checks: 0, predictions_available: 0, recent_analyses: [], activity_by_date: [] }) }));
  await page.route('**/api/v1/dataset-summary', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dataset) }));
  await page.route('**/api/v1/model-evaluation', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'available', model_name: 'random_forest', artifact_type: 'exploratory', production_ready: false, trained_at_utc: null, dataset_rows: 20, repository_group_count: 10, split_method: 'repository_group_holdout', test_rows: 5, precision: 1, recall: 0.6667, f1: 0.8, roc_auc: 0.8333, confusion_matrix: [[2, 0], [1, 2]] }) }));
  await page.route('**/api/v1/repositories', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repositories: [] }) }));
  await page.route('**/api/v1/analyses**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, limit: 100, offset: 0 }) }));
});

async function fillModelInputs(page: Page, filesChanged = '4') {
  const advanced = page.locator('details.advanced-prediction-disclosure');
  if (!(await advanced.evaluate((node) => (node as HTMLDetailsElement).open))) await advanced.locator('summary').click();
  await page.locator('[name="files_changed"]').fill(filesChanged);
  await page.locator('[name="lines_added"]').fill('80');
  await page.locator('[name="avg_files_per_commit"]').fill('3.5');
  await page.locator('[name="branch_commits"]').fill('8');
  await page.locator('[name="branch_files_changed"]').fill('5');
}

async function saveTestPrediction(page: Page, conflict: number, prediction: 0 | 1 = 0) {
  await page.route('**/api/v1/predict', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(response(prediction, conflict)),
  }));
  await page.goto('/#collision');
  await fillModelInputs(page, conflict > 0.5 ? '12' : '4');
  await page.getByRole('button', { name: /Analyze future merge/ }).click();
  await expect(page.getByText('ACTUAL API RESPONSE')).toBeVisible();
}

test('navigates across the seven hash routes with an active-page indicator', async ({ page }) => {
  await page.goto('/');
  const sections = [
    ['Merge Observatory', 'See the merge before it happens.', '#observatory'],
    ['Collision Studio', 'Collision Studio', '#collision'],
    ['Conflict DNA', 'Conflict DNA', '#dna'],
    ['Simulation Lab', 'Simulation Lab', '#simulation'],
    ['Intelligence Archive', 'Intelligence Archive', '#archive'],
    ['Compare Runs', 'Compare Runs', '#compare'],
    ['System Pulse', 'System Pulse', '#pulse'],
  ] as const;

  for (const [navigationLabel, heading, hash] of sections) {
    const navButton = page.getByRole('button', { name: navigationLabel, exact: true });
    await navButton.click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(navButton).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(new RegExp(`${hash}$`));
  }
});

test('mobile navigation opens, routes, and closes accessibly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  await menu.click();
  await expect(page.getByRole('complementary', { name: 'Main navigation' }).getByRole('button', { name: 'Close navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Collision Studio', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Collision Studio' })).toBeVisible();
  await expect(page.evaluate(() => document.documentElement.scrollWidth)).resolves.toBeLessThanOrEqual(390);
});

test('form requires the five model inputs and accepts optional contract fields as blank', async ({ page }) => {
  await page.goto('/#collision');
  await page.locator('details.advanced-prediction-disclosure summary').click();
  await page.getByRole('button', { name: /Analyze future merge/ }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a value for files changed.');

  let received: Record<string, unknown> | null = null;
  await page.route('**/api/v1/predict', async (route) => {
    received = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response(0, 0.21)) });
  });
  await fillModelInputs(page);
  await page.locator('[name="source"]').fill('feature/example');
  await page.locator('[name="target"]').fill('main');
  await page.getByRole('button', { name: /Analyze future merge/ }).click();
  await expect(page.getByText('ACTUAL API RESPONSE')).toBeVisible();
  expect(received).toEqual({ files_changed: 4, lines_added: 80, avg_files_per_commit: 3.5, branch_commits: 8, branch_files_changed: 5 });
  await expect(page.getByText('0.21', { exact: true })).toBeVisible();
  await expect(page.getByText('feature/example', { exact: true })).toHaveCount(0);
});

test('prediction errors are visible and do not create saved history', async ({ page }) => {
  await page.route('**/api/v1/predict', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'MODEL_UNAVAILABLE', message: 'The exploratory prediction model is unavailable.' }, timestamp: '2026-11-14T10:00:00+00:00' }),
  }));
  await page.goto('/#collision');
  await fillModelInputs(page);
  await page.getByRole('button', { name: /Analyze future merge/ }).click();
  await expect(page.getByRole('alert')).toContainText('The exploratory prediction model is unavailable.');
  expect(await page.evaluate(() => localStorage.getItem('gitnexus.predictions.v1'))).toBeNull();
});

test('malformed successful API response is rejected and never saved', async ({ page }) => {
  await page.route('**/api/v1/predict', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ prediction: 0, predicted_class: 'clean_merge' }),
  }));
  await page.goto('/#collision');
  await fillModelInputs(page);
  await page.getByRole('button', { name: /Analyze future merge/ }).click();
  await expect(page.getByRole('alert')).toContainText('response that does not match the prediction contract');
  expect(await page.evaluate(() => localStorage.getItem('gitnexus.predictions.v1'))).toBeNull();
});

test('prediction transport timeout is surfaced and does not save history', async ({ page }) => {
  await page.route('**/api/v1/predict', (route) => route.abort('timedout'));
  await page.goto('/#collision');
  await fillModelInputs(page);
  await page.getByRole('button', { name: /Analyze future merge/ }).click();
  await expect(page.getByRole('alert')).toContainText('Prediction request failed');
  expect(await page.evaluate(() => localStorage.getItem('gitnexus.predictions.v1'))).toBeNull();
});

test('archive stores, searches, filters and reviews only successful API responses', async ({ page }) => {
  await saveTestPrediction(page, 0.31, 0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gitnexus.predictions.v1') ?? '{"records":[]}').records.length)).toBe(1);
  await page.getByRole('button', { name: 'Intelligence Archive', exact: true }).click();
  await expect(page.getByText('pred_', { exact: false }).first()).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search predictions' }).fill('missing-branch');
  await expect(page.getByText('No matching predictions')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search predictions' }).fill('');
  await page.getByRole('button', { name: /Review/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Original request values')).toBeVisible();
});

test('user-controlled branch labels render as text without creating HTML', async ({ page }) => {
  const label = '<img src=x onerror="window.__gitnexusXss=1">';
  await page.route('**/api/v1/predict', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(response(0, 0.21)),
  }));
  await page.goto('/#collision');
  await fillModelInputs(page);
  await page.locator('[name="source"]').fill(label);
  await page.getByRole('button', { name: /Analyze future merge/ }).click();
  await expect(page.getByText('ACTUAL API RESPONSE')).toBeVisible();
  await page.getByRole('button', { name: 'Intelligence Archive', exact: true }).click();
  await expect(page.locator('.archive-row small')).toContainText(label);
  expect(await page.locator('.archive-row img').count()).toBe(0);
  expect(await page.evaluate(() => Object.prototype.hasOwnProperty.call(window, '__gitnexusXss'))).toBe(false);
});

test('simulation modifies a saved request and compares two actual API responses', async ({ page }) => {
  let call = 0;
  await page.route('**/api/v1/predict', async (route) => {
    call += 1;
    const current = route.request().postDataJSON() as { files_changed: number };
    const conflict = current.files_changed > 4 ? 0.72 : 0.28;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response(conflict > 0.5 ? 1 : 0, conflict)) });
  });
  await page.goto('/#collision');
  await fillModelInputs(page, '4');
  await page.getByRole('button', { name: /Analyze future merge/ }).click();
  await expect(page.getByText('ACTUAL API RESPONSE')).toBeVisible();
  await page.getByRole('button', { name: 'Simulation Lab', exact: true }).click();
  await page.getByLabel('Select baseline prediction').selectOption({ index: 1 });
  await page.locator('.simulation-input-grid [type="number"][min="0"]').first().fill('12');
  await page.getByRole('button', { name: 'Run comparison' }).click();
  await expect(page.getByText('Original and modified results')).toBeVisible();
  await expect(page.getByText('0.28', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('0.72', { exact: true }).last()).toBeVisible();
  expect(call).toBe(2);
  await page.getByRole('button', { name: 'Compare Runs', exact: true }).click();
  await page.getByLabel('Select baseline run').selectOption({ index: 1 });
  await page.getByLabel('Select comparison run').selectOption({ index: 2 });
  await expect(page.getByText('Input differences (1)')).toBeVisible();
});

test('System Pulse verifies health, readiness and model info separately', async ({ page }) => {
  const callCounts = { health: 0, ready: 0, info: 0 };
  await page.route('**/health', (route) => { callCounts.health += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', service: 'gitnexus-ai-api', model_available: true }) }); });
  await page.route('**/ready', (route) => { callCounts.ready += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ready', model_available: true }) }); });
  await page.route('**/api/v1/model-info', (route) => { callCounts.info += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model_name: 'random_forest', model_type: 'RandomForestClassifier', model_status: 'exploratory_available', supported_features: ['files_changed', 'lines_added', 'avg_files_per_commit', 'branch_commits', 'branch_files_changed'], supported_feature_count: 5, feature_contract_size: 18, class_mapping: { '0': 'clean_merge', '1': 'merge_conflict' }, dataset_sha256: 'recorded-checksum' }) }); });
  await page.goto('/#pulse');
  await expect(page.getByRole('heading', { name: 'Backend is responding' })).toBeVisible();
  expect(callCounts).toEqual({ health: 1, ready: 1, info: 1 });
  await expect(page.getByText('Verified artifact metadata')).toBeVisible();
  await expect(page.getByText('Recorded model evaluation')).toBeVisible();
  await expect(page.getByText('Confusion matrix · actual rows, predicted columns')).toBeVisible();
  await expect(page.getByText('5 of 18')).toBeVisible();
  await expect(page.getByText('Health response time')).toBeVisible();
  await page.getByRole('button', { name: 'Refresh checks' }).click();
  await expect(page.getByRole('heading', { name: 'Backend is responding' })).toBeVisible();
  expect(callCounts).toEqual({ health: 2, ready: 2, info: 2 });
});

test('unavailable readiness is not mistaken for a ready model', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', service: 'gitnexus-ai-api', model_available: false }) }));
  await page.route('**/ready', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'MODEL_UNAVAILABLE', message: 'The exploratory prediction model is unavailable.' }, timestamp: '2026-11-14T10:00:00+00:00' }) }));
  await page.route('**/api/v1/model-info', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model_name: 'unavailable', model_type: null, model_status: 'unavailable', supported_features: ['files_changed', 'lines_added', 'avg_files_per_commit', 'branch_commits', 'branch_files_changed'], supported_feature_count: 5, feature_contract_size: 18, class_mapping: { '0': 'clean_merge', '1': 'merge_conflict' }, dataset_sha256: null }) }));
  await page.goto('/#pulse');
  await expect(page.getByRole('heading', { name: 'Backend is responding' })).toBeVisible();
  await expect(page.getByText('Not ready', { exact: true })).toBeVisible();
  await expect(page.getByText('Health alone does not prove readiness.', { exact: false })).toBeVisible();
});

test('backend network failure shows offline state and marks prediction as not ready', async ({ page }) => {
  await page.route('http://127.0.0.1:8000/**', (route) => route.abort());
  await page.goto('/#pulse');
  await expect(page.getByRole('heading', { name: 'Backend is unreachable' })).toBeVisible();
  await expect(page.getByText('Not ready', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('supports form validation for negatives and decimals on integer inputs', async ({ page }) => {
  await page.goto('/#collision');
  await fillModelInputs(page, '-1');
  await page.getByRole('button', { name: /Analyze future merge/ }).click();
  await expect(page.getByRole('alert')).toContainText('Files changed must be');
  await page.locator('[name="files_changed"]').fill('4');
  await page.locator('[name="lines_added"]').fill('2.5');
  await page.getByRole('button', { name: /Analyze future merge/ }).click();
  await expect(page.getByRole('alert')).toContainText('Lines added must be');
});

test('corrupted browser history is reported without crashing or being overwritten', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gitnexus.predictions.v1', '{not-json'));
  await page.goto('/#archive');
  await expect(page.getByText('Browser history could not be read.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('gitnexus.predictions.v1'))).toBe('{not-json');
});

test('keeps the seven-page layout within a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/#dna');
  await expect(page.getByRole('heading', { name: 'Conflict DNA' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('all seven pages fit desktop, tablet and mobile viewport widths', async ({ page }) => {
  const pages = ['observatory', 'collision', 'dna', 'simulation', 'archive', 'compare', 'pulse'];
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of pages) {
      await page.goto(`/#${route}`);
      await expect(page.locator('.page-wrap')).toBeVisible();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `${route} overflowed at ${width}px`).toBeLessThanOrEqual(width);
    }
  }
});

test('live frontend saves and displays a prediction from the existing FastAPI model', async ({ page }) => {
  test.skip(process.env.GITNEXUS_LIVE_API !== '1', 'Run with the local FastAPI backend to verify real model integration.');
  await page.goto('/#collision');
  await fillModelInputs(page, '12');
  await page.getByRole('button', { name: /Analyze future merge/ }).click();

  const result = page.locator('.prediction-result');
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result.getByText('random_forest', { exact: true })).toBeVisible();
  await expect(result.getByText('exploratory; not production validated', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gitnexus.predictions.v1') ?? '{"records":[]}').records.length)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Intelligence Archive', exact: true }).click();
  await expect(page.getByRole('button', { name: /Review/ })).toBeVisible();
  await page.getByRole('button', { name: 'Collision Studio', exact: true }).click();
  await fillModelInputs(page, '4');
  await page.getByRole('button', { name: /Analyze future merge/ }).click();
  await expect(page.locator('.prediction-result')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gitnexus.predictions.v1') ?? '{"records":[]}').records.length)).toBe(2);

  await page.getByRole('button', { name: 'Simulation Lab', exact: true }).click();
  await page.getByLabel('Select baseline prediction').selectOption({ index: 1 });
  await page.locator('.simulation-input-grid [type="number"][min="0"]').first().fill('16');
  await page.getByRole('button', { name: 'Run comparison' }).click();
  await expect(page.getByText('Original and modified results')).toBeVisible();

  await page.getByRole('button', { name: 'Compare Runs', exact: true }).click();
  await page.getByLabel('Select baseline run').selectOption({ index: 1 });
  await page.getByLabel('Select comparison run').selectOption({ index: 2 });
  await expect(page.getByText('ACTUAL SAVED RESPONSES')).toBeVisible();
  await page.getByRole('button', { name: 'System Pulse', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Backend is responding' })).toBeVisible();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified artifact metadata')).toBeVisible();
});

test('repository connection lists backend branches and shows actual analysis separately from ML output', async ({ page }) => {
  const calls: string[] = [];
  await page.route('**/api/v1/repositories/connect', async (route) => {
    calls.push(route.request().postDataJSON().value as string);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'repo-1', kind: 'github_url', owner: 'pallets', name: 'flask', default_branch: 'origin/main', branch_count: 2, connected_at: '2026-11-18T10:00:00Z' }) });
  });
  await page.route('**/api/v1/repositories/repo-1/branches', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repository: { id: 'repo-1', kind: 'github_url', owner: 'pallets', name: 'flask', default_branch: 'origin/main', branch_count: 5, connected_at: '2026-11-18T10:00:00Z' }, branches: [{ name: 'main', ref: 'refs/heads/main', commit_sha: 'b'.repeat(40), is_default: false }, { name: 'origin/main', ref: 'refs/remotes/origin/main', commit_sha: 'b'.repeat(40), is_default: true }, { name: 'origin/feature/example', ref: 'refs/remotes/origin/feature/example', commit_sha: 'a'.repeat(40), is_default: false }, { name: 'origin/workflow', ref: 'refs/remotes/origin/workflow', commit_sha: 'c'.repeat(40), is_default: false }, { name: 'origin/automatic-options', ref: 'refs/remotes/origin/automatic-options', commit_sha: 'd'.repeat(40), is_default: false }] }) }));
  await page.route('**/api/v1/repositories/repo-1/analyze', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(testAnalysis({ repository_id: 'repo-1', repository_name: 'flask', merge_check: 'conflict', prediction: null, prediction_unavailable_reason: 'The model is unavailable.' })) }));
  await page.goto('/#collision');
  await page.getByLabel('Repository source type').selectOption('github_url');
  await page.getByLabel('Repository URL').fill('https://github.com/pallets/flask');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('pallets/flask', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Repository source branch')).toHaveValue('refs/remotes/origin/feature/example');
  await expect(page.getByLabel('Repository target branch')).toHaveValue('refs/remotes/origin/main');
  await page.getByRole('button', { name: /Use conflict example/ }).click();
  await expect(page.getByLabel('Repository source branch')).toHaveValue('refs/remotes/origin/workflow');
  await page.getByRole('button', { name: /Use clean example/ }).click();
  await expect(page.getByLabel('Repository source branch')).toHaveValue('refs/remotes/origin/automatic-options');
  await page.getByRole('button', { name: /Use conflict example/ }).click();
  await page.getByRole('button', { name: 'Analyze branches' }).click();
  await expect(page.getByText('Git says conflict')).toBeVisible();
  await expect(page.getByText('The model is unavailable.', { exact: false })).toBeVisible();
  expect(calls).toEqual(['https://github.com/pallets/flask']);
});
