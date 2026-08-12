// Shows the status of background "find similar & send" jobs. Polls the local
// job store so progress updates as the service worker runs each job.
import React, { useEffect, useState } from 'react';
import { BackgroundJob } from '../../types';
import { storageManager } from '../../storage/StorageManager';

const STATUS_STYLE: Record<BackgroundJob['status'], string> = {
  queued: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-100 text-blue-700',
  sending: 'bg-indigo-100 text-indigo-700',
  done: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
};

export const JobsPanel: React.FC = () => {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => storageManager.listJobs().then((j) => { if (alive) setJobs(j); }).catch(() => {});
    load();
    const timer = setInterval(load, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const remove = async (id: string) => {
    await storageManager.deleteJob(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  if (jobs.length === 0) {
    return (
      <div className="p-4 text-center text-[11px] text-gray-400">
        No background jobs yet. Generate a catalog, then use
        “Find similar on other sites & send”.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {jobs.map((job) => (
        <div key={job.id} className="border border-gray-200 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-700 truncate">
              {job.keywords || 'Similar items'}
            </span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[job.status]}`}>
              {job.status}
            </span>
          </div>
          <div className="text-[9px] text-gray-500">
            {job.targetMarketplaces.length} site(s) · {new Date(job.createdAt).toLocaleString()}
          </div>
          {(job.status === 'running' || job.status === 'sending') && (
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div className="bg-blue-500 h-1 rounded-full transition-all duration-700" style={{ width: `${job.progress}%` }} />
            </div>
          )}
          <p className="text-[9px] text-gray-600">{job.message}</p>
          {job.error && <p className="text-[9px] text-red-600">⚠ {job.error}</p>}
          {job.siteResults && job.siteResults.length > 0 && (
            <div className="mt-1 border-t border-gray-100 pt-1 space-y-0.5">
              <p className="text-[8px] font-semibold uppercase tracking-wide text-gray-400">Per-site results</p>
              {job.siteResults.map((r) => (
                <div key={r.marketplace} className="flex items-center justify-between text-[9px]">
                  <span className={r.ok ? 'text-green-700' : 'text-gray-500'}>
                    {r.ok ? '✓' : '✗'} {r.marketplace}
                  </span>
                  <span className={r.ok ? 'text-green-700' : 'text-red-500'}>
                    {r.ok ? `${r.found} item${r.found === 1 ? '' : 's'}` : (r.reason ?? 'no products')}
                  </span>
                </div>
              ))}
            </div>
          )}
          {(job.status === 'done' || job.status === 'error') && (
            <button onClick={() => remove(job.id)} className="text-[9px] text-gray-400 hover:text-red-500">
              Dismiss
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
