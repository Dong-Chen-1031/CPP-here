FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

COPY ./backend/requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

COPY ./backend .

RUN mkdir -p cache

EXPOSE 8000

ENTRYPOINT []
CMD ["python", "main.py"]
