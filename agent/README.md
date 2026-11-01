# GPU Grid agent

The program a provider runs to offer their NVIDIA GPU. It connects to the platform,
receives compiled jobs, runs each one in a locked-down container (see `../SECURITY.md`)
and sends the results back.

## Requirements

- Linux with an NVIDIA GPU and its driver
- Docker and the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).
  Check them with: `docker run --rm --gpus all ubuntu:24.04 nvidia-smi`
- A machine token: in the web, **My machines → Add machine**

## Install with Docker (recommended)

The web shows this command, already filled in, when you register a machine:

```bash
docker run -d --name gpugrid-agent --restart on-failure \
  --network host --gpus all \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /var/lib/gpugrid-agent:/var/lib/gpugrid-agent \
  -e SERVER_URL=https://your-gpugrid-server \
  -e AGENT_TOKEN=ggm_... \
  ghcr.io/luisedmh/gpu-grid-agent:latest
```

What each part does:

| Part                        | Why                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--restart on-failure`      | Starts again after a crash or a reboot, but not after stopping on purpose (wrong token, machine removed)                          |
| `--network host`            | Reaches the server as this machine would                                                                                          |
| `--gpus all`                | Lets the agent read which GPUs there are (`nvidia-smi`)                                                                           |
| `-v /var/run/docker.sock`   | The agent starts each job as a separate container, next to itself                                                                 |
| `-v /var/lib/gpugrid-agent` | Where binaries wait while they run; the same path inside and outside, because the job containers are started by the host's Docker |

Useful commands: `docker logs -f gpugrid-agent` (what it is doing),
`docker rm -f gpugrid-agent` (stop and remove it).

To build the image yourself instead: `docker build -t gpu-grid-agent agent/`, and use
`gpu-grid-agent` as the image name.

## Run from the source code

```bash
cd agent
cp .env.example .env    # then set AGENT_TOKEN (and SERVER_URL if needed)
npm install
npm start
```

## Settings

| Variable         | Default                 | Meaning                                              |
| ---------------- | ----------------------- | ---------------------------------------------------- |
| `AGENT_TOKEN`    | —                       | The machine's token (required)                       |
| `SERVER_URL`     | `http://localhost:3000` | Where the platform is                                |
| `AGENT_RUNTIME`  | Docker's default        | `runsc` runs jobs with gVisor (see `../SECURITY.md`) |
| `AGENT_WORK_DIR` | system temp folder      | Where binaries are kept while they run               |
