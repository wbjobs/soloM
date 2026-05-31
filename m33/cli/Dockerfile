FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY drift_detector/ ./drift_detector/
COPY main.py .

ENTRYPOINT ["python", "main.py"]
