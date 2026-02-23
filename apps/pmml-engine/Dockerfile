# XRules PMML Engine Dockerfile
# R-based statistical model server

FROM rocker/r-ver:4.3.0

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libxml2-dev \
    libssl-dev \
    libcurl4-openssl-dev \
    libfontconfig1-dev \
    libharfbuzz-dev \
    libfribidi-dev \
    libfreetype6-dev \
    libpng-dev \
    libtiff5-dev \
    libjpeg-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install R packages
RUN install2.r --error --skipinstalled \
    plumber \
    pmml \
    XML \
    jsonlite \
    logger \
    r2pmml \
    testthat

# Copy application files
COPY plumber.R .
COPY R/ ./R/
COPY models/ ./models/

# Create directory for uploaded models
RUN mkdir -p /app/models/uploads

# Expose port
EXPOSE 50052

# Environment variables
ENV PORT=50052
ENV HOST=0.0.0.0
ENV R_ENVIRON=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD Rscript -e "library(httr); res <- GET('http://localhost:50052/health'); quit(status = ifelse(res$status_code == 200, 0, 1))"

# Run the application
CMD ["Rscript", "plumber.R"]
