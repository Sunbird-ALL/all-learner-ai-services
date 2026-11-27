import * as fs from 'fs';
import * as os from 'os';

const readNumbers = (path: string): string[] | null => {
  try {
    return fs.readFileSync(path, 'utf8').trim().split(/\s+/);
  } catch {
    return null;
  }
};

// Number of worker processes to start: WEB_CONCURRENCY if set, else the
// container's CPU limit, else os.cpus().length.
//
// Inside a container os.cpus() returns the node's cores, so a pod limited to
// 2 CPUs on a 16-core node started 16 workers fighting over 2 CPUs, each with
// its own MongoDB connection pool. Same rule as all-learner-text-eval.
export const workerCount = (): number => {
  const fromEnv = parseInt(process.env.WEB_CONCURRENCY ?? '', 10);
  if (fromEnv > 0) return fromEnv;

  // cgroup v2: "<quota> <period>" or "max <period>"
  const v2 = readNumbers('/sys/fs/cgroup/cpu.max');
  if (v2 && v2[0] !== 'max') {
    const quota = parseInt(v2[0], 10);
    const period = parseInt(v2[1], 10);
    if (quota > 0 && period > 0) return Math.max(1, Math.floor(quota / period));
  }

  // cgroup v1
  const v1Quota = readNumbers('/sys/fs/cgroup/cpu/cpu.cfs_quota_us');
  const v1Period = readNumbers('/sys/fs/cgroup/cpu/cpu.cfs_period_us');
  if (v1Quota && v1Period) {
    const quota = parseInt(v1Quota[0], 10);
    const period = parseInt(v1Period[0], 10);
    if (quota > 0 && period > 0) return Math.max(1, Math.floor(quota / period));
  }

  return os.cpus().length || 1;
};
