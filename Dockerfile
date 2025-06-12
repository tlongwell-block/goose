# Use a Rust base image to build Goose
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
    libprotobuf-dev \
    protobuf-compiler \
    git \
    && rm -rf /var/lib/apt/lists/*
# Create a new empty shell project
WORKDIR /usr/src
RUN git clone --depth 1 --branch platform_scheduler https://github.com/tlongwell-block/goose.git
WORKDIR /usr/src/goose
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
    python3 \
    python3-pip \
    python3-venv \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/* && \
    # Create a directory for tools that all users can access
    mkdir -p /opt/tools/bin && \
    # Install UVX
    curl -LsSf https://astral.sh/uv/install.sh | sh && \
    # Copy UVX to the shared location
    cp /root/.local/bin/uv /opt/tools/bin/ && \
    cp /root/.local/bin/uvx /opt/tools/bin/ && \
    # Make the tools directory accessible to all users
    chmod -R 755 /opt/tools && \
    # Verify installations
    python3 --version && \
    /opt/tools/bin/uv --version
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
ENV PATH="/app/bin:/opt/tools/bin:${PATH}"
# smart_approve is the default and is not very smart. Let the slackbot make approval decisions
ENV GOOSE_MODE="approve"
# Set working directory for the process
WORKDIR /app

# Start goosed in agent mode
CMD ["/app/bin/goosed", "agent"]
