FROM node:22

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y \
    libgtk-3-0 \
    libnotify-dev \
    libgconf-2-4 \
    libnss3 \
    libxss1 \
    libasound2 \
    libxtst6 \
    xvfb \
    wine64 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# We'll mount the project directory as a volume
# This allows for the build artifacts to be accessible from the host

CMD ["bash"] 