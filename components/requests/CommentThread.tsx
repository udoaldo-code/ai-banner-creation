"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";

interface Author {
  id: string;
  name: string | null;
  email: string;
  image?: string | null;
}

interface Comment {
  id: string;
  body: string;
  authorId: string;
  createdAt: string;
  deletedAt: string | null;
  author: Author;
  replies?: Comment[];
}

interface CommentThreadProps {
  requestId: string;
  currentUserId: string;
  canAdmin?: boolean;
}

function Avatar({ author }: { author: Author }) {
  const initials = (author.name ?? author.email).slice(0, 2).toUpperCase();
  return (
    <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center shrink-0">
      {initials}
    </div>
  );
}

function CommentBody({ comment, requestId, currentUserId, canAdmin, onDeleted }: {
  comment: Comment;
  requestId: string;
  currentUserId: string;
  canAdmin: boolean;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replies, setReplies] = useState<Comment[]>(comment.replies ?? []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replying) textareaRef.current?.focus();
  }, [replying]);

  const canDelete = canAdmin || comment.authorId === currentUserId;
  const isDeleted = !!comment.deletedAt;

  async function handleDelete() {
    if (!confirm("Delete this comment?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/requests/${requestId}/comments?commentId=${comment.id}`, {
        method: "DELETE",
      });
      onDeleted(comment.id);
    } finally {
      setDeleting(false);
    }
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: replyText.trim(),
          parentId: comment.id,
          entityType: "REQUEST",
        }),
      });
      if (res.ok) {
        const reply: Comment = await res.json();
        setReplies((prev) => [...prev, reply]);
        setReplyText("");
        setReplying(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex gap-3">
      <Avatar author={comment.author} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-gray-900">
            {comment.author.name ?? comment.author.email}
          </span>
          <span className="text-xs text-gray-400">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
        </div>

        {isDeleted ? (
          <p className="text-sm text-gray-400 italic mt-0.5">[deleted]</p>
        ) : (
          <>
            <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{comment.body}</p>
            <div className="flex items-center gap-3 mt-1">
              <button
                onClick={() => setReplying((v) => !v)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Reply
              </button>
              {canDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
          </>
        )}

        {/* Replies */}
        {replies.length > 0 && (
          <div className="mt-3 space-y-3 pl-3 border-l-2 border-gray-100">
            {replies.map((reply) => (
              <CommentBody
                key={reply.id}
                comment={reply}
                requestId={requestId}
                currentUserId={currentUserId}
                canAdmin={canAdmin}
                onDeleted={(id) => setReplies((prev) => prev.filter((r) => r.id !== id))}
              />
            ))}
          </div>
        )}

        {/* Reply input */}
        {replying && (
          <form onSubmit={submitReply} className="mt-2 space-y-1.5">
            <textarea
              ref={textareaRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
              placeholder="Write a reply…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || !replyText.trim()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Posting…" : "Post Reply"}
              </button>
              <button
                type="button"
                onClick={() => { setReplying(false); setReplyText(""); }}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function CommentThread({ requestId, currentUserId, canAdmin = false }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/requests/${requestId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newComment.trim(), entityType: "REQUEST" }),
      });
      if (res.ok) {
        const created: Comment = await res.json();
        setComments((prev) => [...prev, created]);
        setNewComment("");
      }
    } finally {
      setPosting(false);
    }
  }

  function handleTopLevelDeleted(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-gray-400">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-400">No comments yet.</p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentBody
              key={comment.id}
              comment={comment}
              requestId={requestId}
              currentUserId={currentUserId}
              canAdmin={canAdmin}
              onDeleted={handleTopLevelDeleted}
            />
          ))}
        </div>
      )}

      {/* New comment composer */}
      <form onSubmit={postComment} className="pt-2 border-t border-gray-100 space-y-2">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          rows={3}
          placeholder="Add a comment or clarification…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
        <button
          type="submit"
          disabled={posting || !newComment.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {posting ? "Posting…" : "Post Comment"}
        </button>
      </form>
    </div>
  );
}
