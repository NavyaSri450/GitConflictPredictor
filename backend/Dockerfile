# Build this image from the project root so the managed model and ml modules
# can be copied from their documented paths.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r /app/requirements.txt

RUN addgroup --system gitnexus \
    && adduser --system --ingroup gitnexus --no-create-home gitnexus

COPY backend/app /app/backend/app
COPY ml/__init__.py ml/features.py ml/predict.py /app/ml/
COPY ml/data/__init__.py ml/data/validate.py /app/ml/data/
COPY ml/training/__init__.py ml/training/pipeline.py /app/ml/training/
COPY ml/models/exploratory/merge_conflict_exploratory_model.joblib /app/ml/models/exploratory/merge_conflict_exploratory_model.joblib

USER gitnexus
EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn app.main:app --app-dir /app/backend --host 0.0.0.0 --port ${PORT:-8000}"]
