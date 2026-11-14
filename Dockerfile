# Multi-runtime image: Python 3.12 + Node.js 22 + FFmpeg + Chromium libraries for Google Cloud Run
FROM python:3.12-slim-bookworm

# Set non-interactive debian frontend
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies: curl, ffmpeg, fonts, and browser runtime libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg \
    ca-certificates \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    fonts-noto \
    fonts-noto-color-emoji \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgbm1 \
    libasound2 \
    libxrandr2 \
    libxkbcommon0 \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Install HyperFrames Node dependencies
COPY hyperframes/package*.json ./hyperframes/
RUN npm ci --prefix hyperframes --no-fund --no-audit

# Install Remotion Node dependencies
COPY remotion/package*.json ./remotion/
RUN npm ci --prefix remotion --no-fund --no-audit && \
    npx --prefix remotion remotion browser ensure

# Copy application source
COPY app/ ./app/
COPY web/ ./web/
COPY static/ ./static/
COPY assets/ ./assets/
COPY docs/ ./docs/
COPY licenses/ ./licenses/
COPY remotion/ ./remotion/
COPY hyperframes/ ./hyperframes/

# Create persistent/temporary data directory
RUN mkdir -p /data && chmod 777 /data
ENV FRAMEFORGE_DATA=/data
ENV FRAMEFORGE_HOSTED=1
ENV REMOTION_BROWSER=/usr/bin/chromium
ENV PORT=8080
ENV FRAMEFORGE_PORT=8080

EXPOSE 8080

# Cloud Run invokes containers listening on $PORT
CMD ["sh", "-c", "uvicorn app.server:app --host 0.0.0.0 --port ${PORT:-8080}"]
