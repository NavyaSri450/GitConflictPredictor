import os
from pathlib import Path


class Settings:
    """Small environment-based settings object; avoids an extra dependency."""

    app_name = "GitNexus AI API"
    environment = os.getenv("GITNEXUS_ENV", "development").strip().lower()

    @property
    def model_path(self) -> Path:
        # Fixed project artifact path. Clients cannot choose a model file.
        project_root = Path(__file__).resolve().parents[3]
        return project_root / "ml" / "models" / "exploratory" / "merge_conflict_exploratory_model.joblib"

    @property
    def project_root(self) -> Path:
        return Path(__file__).resolve().parents[3]

    @property
    def data_directory(self) -> Path:
        configured = os.getenv("GITNEXUS_DATA_DIRECTORY")
        return Path(configured).expanduser().resolve() if configured else self.project_root / "backend" / "data"

    @property
    def database_path(self) -> Path:
        configured = os.getenv("GITNEXUS_DATABASE_PATH")
        return Path(configured).expanduser().resolve() if configured else self.data_directory / "gitnexus.sqlite3"

    @property
    def repository_cache_path(self) -> Path:
        configured = os.getenv("GITNEXUS_REPOSITORY_CACHE")
        return Path(configured).expanduser().resolve() if configured else self.data_directory / "repositories"

    @property
    def local_repository_roots(self) -> list[Path]:
        configured = os.getenv("GITNEXUS_LOCAL_REPOSITORY_ROOTS", "")
        return [Path(item.strip()).expanduser().resolve() for item in configured.split(os.pathsep) if item.strip()]

    @property
    def cors_origins(self) -> list[str]:
        configured = os.getenv("GITNEXUS_CORS_ORIGINS")
        if configured is None:
            if self.environment == "production":
                raise ValueError("Set GITNEXUS_CORS_ORIGINS explicitly when GITNEXUS_ENV=production.")
            configured = ",".join((
                "http://127.0.0.1:5173",
                "http://localhost:5173",
                "http://127.0.0.1:5174",
                "http://localhost:5174",
                "http://127.0.0.1:4173",
                "http://localhost:4173",
            ))
        origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
        if "*" in origins:
            raise ValueError("GITNEXUS_CORS_ORIGINS must list explicit origins; wildcard is not supported.")
        if self.environment == "production" and not origins:
            raise ValueError("At least one explicit GITNEXUS_CORS_ORIGINS value is required in production.")
        return origins


settings = Settings()
