# Build stage
FROM rust:1.75-slim-bookworm as builder

# Install dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first for better caching
COPY Cargo.toml Cargo.lock build.rs ./
COPY proto/ ./proto/

# Create a dummy main.rs to build dependencies
RUN mkdir -p src && echo "fn main() {}" > src/main.rs

# Build dependencies (this layer will be cached)
RUN cargo build --release && rm -rf src

# Copy source code
COPY src/ ./src/

# Build the actual application
RUN touch src/main.rs && cargo build --release

# Runtime stage
FROM debian:bookworm-slim as runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/target/release/xrules-engine /usr/local/bin/xrules-engine

# Create non-root user
RUN useradd -m -u 1000 xrules && chown -R xrules:xrules /app
USER xrules

# Expose ports
EXPOSE 50051 9090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD grpc-health-probe -addr=localhost:50051 || exit 1

# Set environment variables
ENV ENGINE_HOST=0.0.0.0
ENV ENGINE_PORT=50051
ENV RUST_LOG=info

# Run the application
ENTRYPOINT ["xrules-engine"]
