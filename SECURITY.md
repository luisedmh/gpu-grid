# Security model

GPU Grid runs **code written by strangers on computers owned by other strangers**.
This document explains what protects each side, and what is still not protected.

## Who could attack whom

| Attacker   | Target                 | Example                                                                                     |
| ---------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| A client   | The provider's machine | A CUDA program that reads the provider's files, mines crypto, or attacks their home network |
| A client   | The platform           | Source code that abuses the compiler, or floods it with jobs                                |
| A provider | The client             | Returning made-up output and still getting paid                                             |
| A provider | The platform           | Pretending to be another machine, or downloading other jobs                                 |

## Protections

### On the provider's machine (the agent)

Every job runs in a short-lived Docker container built by `sandboxArgs()` in
`agent/src/runner.ts`. Each flag is one layer:

| Layer             | Flag                                                                        | What it prevents                                                 |
| ----------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| No network        | `--network none`                                                            | Sending data out, attacking the local network, downloading tools |
| Unprivileged user | `--user 65534:65534`                                                        | Acting as root inside the container                              |
| No capabilities   | `--cap-drop ALL`                                                            | Every privileged kernel operation (mounting, raw sockets, ...)   |
| No escalation     | `--security-opt no-new-privileges`                                          | Gaining privileges through setuid programs                       |
| Read-only system  | `--read-only`, binary mounted `:ro`                                         | Changing any file, leaving anything behind                       |
| Scratch space     | `--tmpfs /tmp:noexec,size=64m`                                              | Running downloaded or generated programs                         |
| Resource limits   | `--memory 4g --memory-swap 4g --cpus 2 --pids-limit 64 --ulimit nofile=256` | Exhausting RAM, CPU or processes (fork bombs)                    |
| Time limit        | `docker kill` after the job's time limit                                    | Running forever                                                  |
| Integrity         | SHA-256 checked before running                                              | Running a binary that was corrupted or swapped on the way        |
| Optional: gVisor  | `AGENT_RUNTIME=runsc`                                                       | Talking to the host kernel directly (see below)                  |

The agent checks the sandbox when it starts (`agent/src/security.ts`): it runs
`nvidia-smi` inside the very same locked-down container the jobs use, and
**refuses to start** if the GPU is not visible there, or if `AGENT_RUNTIME` names a
runtime Docker does not have. Better not to take jobs than to fail them all.

### On the platform (the backend)

- **Compilation** runs in the same kind of jail: no network, no capabilities,
  read-only system, limits and a time limit (`backend/src/compiler/docker-compiler.ts`).
- **Each machine has its own token.** Only its SHA-256 is stored; a stolen database
  does not give working tokens. A machine can only download the binary of the job
  it is running right now.
- **Sessions** are signed JWTs in `httpOnly`, `SameSite=Strict` cookies. Passwords are
  stored as salted scrypt hashes. Admin rights are checked against the database on
  every admin request, so removing them takes effect at once.
- **Every message from an agent is validated** (Zod) before it is used.
- **Credits** are reserved atomically, so nobody can spend credits they do not have.

### Against dishonest providers: verification jobs

A provider could return made-up output and still get paid. The platform cannot
recompute every job (that would need its own GPU), so it **spot-checks**
(`backend/src/verification/`):

- **Verification jobs** are small CUDA programs with random parameters that compute
  a checksum with integer arithmetic. The backend works out the right answer on the
  CPU with exactly the same arithmetic (checked against a C version of the kernel),
  so it knows what the GPU must print. The parameters change every time, so answers
  cannot be remembered, and to the agent they look like any other job.
- **A new machine gets one as soon as it connects, and no users' jobs until it passes.**
- **After users' jobs, a machine is sometimes checked again** (`SPOT_CHECK_RATE`,
  10 % of jobs by default), unannounced: behaving well at first and cheating later
  does not work.
- **A wrong answer (or none) suspends the machine**: it is disconnected, cannot
  connect again, and its owner sees why. An administrator can reinstate it, and it
  must then pass a new check.
- Verification jobs cost nothing and pay nothing, and users never see them.

This makes cheating risky, not impossible: a provider who could tell verification
jobs apart from real ones (for example by analysing every binary) could answer
those correctly and cheat on the rest. Running some real jobs twice on different
machines and comparing would close that gap, at the cost of paying for them twice.

## Stronger isolation with gVisor (optional)

A normal container shares the host's Linux kernel: a bug in the kernel or in the
NVIDIA driver could let a program escape. [gVisor](https://gvisor.dev) puts its
own kernel, written in a memory-safe language, between the program and the real one.
Its `nvproxy` feature lets programs use NVIDIA GPUs through it.

Requirements: native Linux (not WSL), and an NVIDIA driver version that gVisor
supports (`runsc nvproxy list-supported-drivers`). Consumer GPUs such as the RTX 30
and 40 series are not officially supported by gVisor, but may work.

1. Install `runsc` following <https://gvisor.dev/docs/user_guide/install/>.
2. Register it in Docker with GPU support, and restart Docker:
   ```bash
   sudo runsc install -- --nvproxy=true
   sudo systemctl restart docker
   ```
3. Check that a CUDA program sees the GPU through gVisor:
   ```bash
   docker run --rm --runtime=runsc --gpus=all nvidia/cuda:13.0.1-base-ubuntu24.04 nvidia-smi
   ```
4. Set `AGENT_RUNTIME=runsc` in `agent/.env` and restart the agent. It will say
   "gVisor is on".

## What is still not protected

Being honest about the limits is part of the design:

- **The GPU is shared hardware.** Without gVisor, the program talks to the real
  NVIDIA driver; a driver vulnerability could be used to escape. GPU memory left by
  one job is normally cleared by the driver, but this relies on the driver.
- **Providers can read clients' programs and results.** The binary and its output
  pass through their machine. Only clients who accept this should use the platform;
  real confidentiality would need confidential-computing GPUs.
- **Side channels** (timing, power) between a job and the provider's own programs are
  not addressed.
- **Docker itself is trusted.** The agent needs access to Docker, which is equivalent
  to root on the provider's machine; the provider must trust the agent's code.
- **Results are spot-checked, not proven correct** (see "verification jobs" above).
