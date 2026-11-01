/** Program shown in the editor the first time, so there is something to run. */
export const VECTOR_ADD_EXAMPLE = `#include <cstdio>

__global__ void vectorAdd(const float *a, const float *b, float *c, int n) {
  int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) c[i] = a[i] + b[i];
}

int main() {
  const int n = 1 << 20;
  float *a, *b, *c;
  cudaMallocManaged(&a, n * sizeof(float));
  cudaMallocManaged(&b, n * sizeof(float));
  cudaMallocManaged(&c, n * sizeof(float));
  for (int i = 0; i < n; i++) { a[i] = 1.0f; b[i] = 2.0f; }

  vectorAdd<<<(n + 255) / 256, 256>>>(a, b, c, n);
  cudaDeviceSynchronize();

  cudaDeviceProp prop;
  cudaGetDeviceProperties(&prop, 0);
  printf("Ran on %s\\n", prop.name);
  printf("c[0] = %.1f (expected 3.0)\\n", c[0]);

  cudaFree(a);
  cudaFree(b);
  cudaFree(c);
  return 0;
}
`;
