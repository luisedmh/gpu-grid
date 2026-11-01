#include <cstdio>
#include <cstdlib>

#define CHECK(call)                                                        \
  do {                                                                     \
    cudaError_t err = (call);                                              \
    if (err != cudaSuccess) {                                              \
      fprintf(stderr, "CUDA error: %s (%s:%d)\n", cudaGetErrorString(err), \
              __FILE__, __LINE__);                                         \
      return EXIT_FAILURE;                                                 \
    }                                                                      \
  } while (0)

__global__ void vectorAdd(const float *a, const float *b, float *c, int n) {
  int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) c[i] = a[i] + b[i];
}

int main() {
  const int n = 1 << 24;  // 16M elements
  const size_t bytes = n * sizeof(float);

  cudaDeviceProp prop;
  CHECK(cudaGetDeviceProperties(&prop, 0));
  printf("GPU: %s (compute capability %d.%d)\n", prop.name, prop.major, prop.minor);

  float *a, *b, *c;
  CHECK(cudaMallocManaged(&a, bytes));
  CHECK(cudaMallocManaged(&b, bytes));
  CHECK(cudaMallocManaged(&c, bytes));
  for (int i = 0; i < n; i++) {
    a[i] = 1.0f;
    b[i] = 2.0f;
  }

  cudaEvent_t start, stop;
  CHECK(cudaEventCreate(&start));
  CHECK(cudaEventCreate(&stop));

  const int threads = 256;
  const int blocks = (n + threads - 1) / threads;
  CHECK(cudaEventRecord(start));
  vectorAdd<<<blocks, threads>>>(a, b, c, n);
  CHECK(cudaGetLastError());
  CHECK(cudaEventRecord(stop));
  CHECK(cudaEventSynchronize(stop));

  float ms = 0;
  CHECK(cudaEventElapsedTime(&ms, start, stop));

  int errors = 0;
  for (int i = 0; i < n; i++)
    if (c[i] != 3.0f) errors++;

  printf("Elements: %d | Kernel time: %.3f ms | Errors: %d\n", n, ms, errors);
  printf(errors == 0 ? "Result OK\n" : "Result WRONG\n");

  CHECK(cudaFree(a));
  CHECK(cudaFree(b));
  CHECK(cudaFree(c));
  return errors == 0 ? EXIT_SUCCESS : EXIT_FAILURE;
}