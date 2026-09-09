import React from 'react';
import { JobModel } from '../../types/job';
import { ShieldCheck, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface PublishApprovalModalProps {
  job: JobModel;
  isOpen: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export const PublishApprovalModal: React.FC<PublishApprovalModalProps> = ({
  job,
  isOpen,
  onApprove,
  onReject,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-amber-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-neutral-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-amber-300">Operator Approval Required</h3>
            <p className="text-xs text-neutral-400">Zero-Trust Safety Verification Gate</p>
          </div>
        </div>

        <p className="text-sm text-neutral-300 mb-4 leading-relaxed">
          The automated workflow has reached the final <span className="font-semibold text-white">PUBLISHING</span> step.
          As mandated by safety guidelines, Phone Agent will never publish content to external platforms without your explicit authorization.
        </p>

        <div className="bg-neutral-950/80 rounded-xl border border-neutral-800 p-4 space-y-2.5 text-xs mb-5">
          <div className="flex justify-between border-b border-neutral-800 pb-2">
            <span className="text-neutral-400">Job ID:</span>
            <span className="font-mono text-neutral-200">{job.jobId}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-800 pb-2">
            <span className="text-neutral-400">Target Platform:</span>
            <span className="font-semibold text-emerald-400 uppercase">{job.platform}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-800 pb-2">
            <span className="text-neutral-400">Action:</span>
            <span className="font-mono text-neutral-200">{job.action}</span>
          </div>
          {job.videoUri && (
            <div className="flex justify-between border-b border-neutral-800 pb-2">
              <span className="text-neutral-400">Media URI:</span>
              <span className="font-mono text-cyan-400 truncate max-w-[220px]">{job.videoUri}</span>
            </div>
          )}
          {job.imageUri && !job.videoUri && (
            <div className="flex justify-between border-b border-neutral-800 pb-2">
              <span className="text-neutral-400">Image URI:</span>
              <span className="font-mono text-cyan-400 truncate max-w-[220px]">{job.imageUri}</span>
            </div>
          )}
          {job.title && (
            <div className="flex justify-between border-b border-neutral-800 pb-2">
              <span className="text-neutral-400">Title:</span>
              <span className="font-semibold text-neutral-200">{job.title}</span>
            </div>
          )}
          {job.board && (
            <div className="flex justify-between border-b border-neutral-800 pb-2">
              <span className="text-neutral-400">Board:</span>
              <span className="font-semibold text-rose-400">{job.board}</span>
            </div>
          )}
          {(job.caption || job.description) && (
            <div className="border-b border-neutral-800 pb-2">
              <span className="text-neutral-400 block mb-1">Description:</span>
              <p className="text-neutral-200 italic bg-neutral-900 p-2 rounded text-xs">{job.description || job.caption}</p>
            </div>
          )}
          {job.hashtags && job.hashtags.length > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-neutral-400">Hashtags:</span>
              <div className="flex flex-wrap gap-1 justify-end max-w-[240px]">
                {job.hashtags.map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px]">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl mb-6 text-amber-200/90 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Confirming will trigger the final UI click on the platform publish button.</span>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onReject}
            className="px-4 py-2.5 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-medium transition-colors flex items-center gap-2"
          >
            <XCircle className="w-4 h-4 text-red-400" />
            Reject & Stop Job
          </button>
          <button
            onClick={onApprove}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Authorize & Publish
          </button>
        </div>
      </div>
    </div>
  );
};
