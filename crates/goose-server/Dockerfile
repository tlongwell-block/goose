# Use a Rust base image
FROM rust:1.76-slim-bookworm as builder

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    pkg-config \
    libdbus-1-dev \
    libxcb1-dev \
    libxcb-render0-dev \
    libxcb-shape0-dev \
    libxcb-xfixes0-dev \
    && rm -rf /var/lib/apt/lists/*

# Create a new empty shell project
WORKDIR /usr/src/goose
# Copy over your manifests and source code
COPY . .

# Build your project with debug symbols
RUN RUSTFLAGS="-g" cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install necessary runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    libdbus-1-3 \
    libxcb1 \
    libxcb-render0 \
    libxcb-shape0 \
    libxcb-xfixes0 \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create app directory and bin directory
RUN mkdir -p /app/bin

# Copy the built binary to both locations
COPY --from=builder /usr/src/goose/target/release/goosed /app/bin/goosed

# Create a non-root user to run the server
RUN useradd -m goose && \
    # Give ownership of the app directory to goose user
    chown -R goose:goose /app

# Switch to non-root user
USER goose

# Set environment variables
ENV PATH="/app/bin:${PATH}"

# Set working directory for the process
WORKDIR /app

# Start goosed in agent mode
CMD ["/app/bin/goosed", "agent"]
