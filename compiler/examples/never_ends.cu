#include <cstdio>
#include <unistd.h>

// Simulates a job that never finishes, to test the agent's timeout.
int main() {
  printf("Started, now waiting forever...\n");
  fflush(stdout);
  while (true) sleep(1);
}