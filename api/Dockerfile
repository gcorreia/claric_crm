FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# deps (runtime + dev/test)
COPY requirements.txt /app/requirements.txt
COPY requirements-dev.txt /app/requirements-dev.txt

RUN pip install --no-cache-dir -r /app/requirements.txt \
 && pip install --no-cache-dir -r /app/requirements-dev.txt

COPY . /app

CMD ["sh", "./start.sh"]