import os
import signal
import subprocess
from pathlib import Path

env_path = Path.home() / ".brainapi" / "source" / ".env"
source = Path.home() / ".brainapi" / "source"
env = os.environ.copy()
for raw in env_path.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1]
    env.setdefault(key, value)

env.update({
    "PIPELINE_MODE": "lightweight",
    "EMBEDDINGS_PROVIDER": "ollama",
    "EMBEDDINGS_LOCAL_MODEL": "nomic-embed-text:latest",
    "EMBEDDING_NODES_DIMENSION": "768",
    "EMBEDDING_TRIPLETS_DIMENSION": "768",
    "EMBEDDING_OBSERVATIONS_DIMENSION": "768",
    "EMBEDDING_DATA_DIMENSION": "768",
    "EMBEDDING_RELATIONSHIPS_DIMENSION": "768",
})

HAIKU = "us.anthropic.claude-haiku-5-5"
PROFILE = os.environ.get("BEDROCK_AWS_PROFILE", "brain-api-root")

for key in (
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "BEDROCK_ACCESS_KEY_ID",
    "BEDROCK_SECRET_ACCESS_KEY",
    "BEDROCK_SESSION_TOKEN",
):
    env.pop(key, None)

env.update({
    "AWS_PROFILE": PROFILE,
    "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_REGION": "us-east-1",
    "AWS_SDK_LOAD_CONFIG": "1",
    "LLM_SMALL_PROVIDER": "amazon_bedrock",
    "LLM_LARGE_PROVIDER": "amazon_bedrock",
    "BEDROCK_REGION": "us-east-1",
    "BEDROCK_SMALL_LLM_MODEL": HAIKU,
    "BEDROCK_LARGE_LLM_MODEL": HAIKU,
})

venv = source / ".venv" / "bin"
api = subprocess.Popen(
    [str(venv / "uvicorn"), "src.services.api.app:app", "--host", "127.0.0.1", "--port", "8010"],
    cwd=source,
    env=env,
)
worker = subprocess.Popen(
    [str(venv / "celery"), "-A", "src.workers.app", "worker", "--loglevel=info", "--pool=threads"],
    cwd=source,
    env=env,
)


def stop(*_args):
    for proc in (api, worker):
        if proc.poll() is None:
            proc.send_signal(signal.SIGTERM)
    raise SystemExit(0)


signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)
while True:
    if api.poll() is not None or worker.poll() is not None:
        stop()
    try:
        api.wait(timeout=1)
    except subprocess.TimeoutExpired:
        pass
