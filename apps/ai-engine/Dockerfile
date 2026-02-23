# XRules AI Engine Dockerfile
# Deep Learning model server

FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies (CPU version by default)
COPY pyproject.toml .
RUN pip install --no-cache-dir -e "."

# Copy application code
COPY src/ ./src/

# Create directories
RUN mkdir -p /app/models /app/uploads

# Environment variables
ENV PORT=50055
ENV HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 50055

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:50055/health'); exit(0 if r.status_code == 200 else 1)"

# Run the application
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "50055"]
