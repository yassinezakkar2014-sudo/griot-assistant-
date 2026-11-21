# OpenJarvis (https://github.com/open-jarvis/OpenJarvis) prêt pour Render,
# avec Groq comme moteur via LiteLLM. Interface web + API compatible OpenAI.
ARG OPENJARVIS_REF=5a9b5268f2432f7ea4fe402e384ecb6b64a649bb

FROM alpine/git:2.47.2 AS source
ARG OPENJARVIS_REF
RUN git clone https://github.com/open-jarvis/OpenJarvis.git /src && \
    git -C /src checkout "$OPENJARVIS_REF"

FROM node:22-slim AS frontend
COPY --from=source /src /src
WORKDIR /src/frontend
RUN npm install --global "$(node -p 'require("./package.json").packageManager')" && \
    npm ci --ignore-scripts && \
    npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
COPY --from=frontend /src /app
WORKDIR /app
RUN pip install uv && uv pip install --system ".[server,inference-litellm]" && \
    groupadd --system --gid 10001 openjarvis && \
    useradd --system --uid 10001 --gid openjarvis --create-home --home-dir /home/openjarvis openjarvis
ENV HOME=/home/openjarvis OPENJARVIS_HOME=/home/openjarvis/.openjarvis
COPY --chown=openjarvis:openjarvis config.toml /home/openjarvis/.openjarvis/config.toml
USER openjarvis
EXPOSE 10000
# JARVIS_MODEL permet de changer de modèle Groq depuis Render sans reconstruire.
ENV JARVIS_MODEL=groq/openai/gpt-oss-120b
ENTRYPOINT ["sh", "-c", "sed -i \"s|^default_model = .*|default_model = \\\"$JARVIS_MODEL\\\"|\" \"$OPENJARVIS_HOME/config.toml\" && exec jarvis serve --host 0.0.0.0 --port \"${PORT:-10000}\" --engine litellm --model \"$JARVIS_MODEL\""]
