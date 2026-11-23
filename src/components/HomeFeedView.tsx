import React, { useEffect, useState } from 'react';
import {
  Heart,
  MessageCircle,
  Share2,
  ImagePlus,
  Send,
  Trash2,
  X,
  Sparkles,
} from 'lucide-react';
import { AuthUser, FeedPost } from '../types/vibenexa';
import { apiFetch, formatRelativeTime, uploadCompressedMedia } from '../lib/api';
import { UserAvatar, VerifiedBadge } from './BrandLogo';

interface HomeFeedViewProps {
  currentUser: AuthUser;
  onViewProfile: (uid: string) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function HomeFeedView({ currentUser, onViewProfile, onNotify }: HomeFeedViewProps) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [openCommentsId, setOpenCommentsId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  async function loadFeed() {
    setLoading(true);
    try {
      const res = await apiFetch<{ posts: FeedPost[] }>('/api/posts');
      setPosts(res.posts);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not load feed.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, []);

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadCompressedMedia(file, 'public', 1080);
      setImageUrl(url);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    if (!caption.trim() && !imageUrl) return;
    setPublishing(true);
    try {
      const res = await apiFetch<{ post: FeedPost }>('/api/posts', {
        method: 'POST',
        body: { caption: caption.trim(), imageUrl: imageUrl || undefined },
      });
      setPosts((prev) => [res.post, ...prev]);
      setCaption('');
      setImageUrl('');
      onNotify('success', 'Post published to VibeNexa Feed.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to publish post.');
    } finally {
      setPublishing(false);
    }
  }

  async function handleLike(postId: string) {
    try {
      const res = await apiFetch<{ post: FeedPost }>(`/api/posts/${postId}/like`, {
        method: 'POST',
      });
      setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Action failed.');
    }
  }

  async function handleComment(postId: string) {
    if (!commentText.trim()) return;
    try {
      const res = await apiFetch<{ post: FeedPost }>(`/api/posts/${postId}/comments`, {
        method: 'POST',
        body: { text: commentText.trim() },
      });
      setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
      setCommentText('');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not post comment.');
    }
  }

  async function handleDelete(postId: string) {
    try {
      await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      onNotify('info', 'Post deleted.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not delete post.');
    }
  }

  async function handleShare(post: FeedPost) {
    const shareText = `${post.authorName} (@${post.authorUsername}) on VibeNexa: "${post.caption.slice(0, 100)}"`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'VibeNexa Post', text: shareText, url: window.location.href });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText} — ${window.location.href}`);
        onNotify('success', 'Post link copied to clipboard.');
      }
    } catch {
      onNotify('info', 'Share canceled.');
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {currentUser.ageGroup === 'minor' && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">
          <p className="font-semibold">Teen Safe Social Feed</p>
          <p className="text-xs text-rose-700 mt-0.5">
            You are viewing age-appropriate community posts only. Adult dating features are kept completely separate.
          </p>
        </div>
      )}

      {/* Create Post Card */}
      <form
        onSubmit={handleCreatePost}
        className="bg-white rounded-3xl p-4 sm:p-5 border border-rose-100 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <UserAvatar photoUrl={currentUser.photoUrl} name={currentUser.name} size="md" />
          <div className="flex-1 min-w-0">
            <textarea
              rows={2}
              maxLength={1000}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={`Share a genuine moment, ${currentUser.name.split(' ')[0]}...`}
              className="w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none resize-none"
            />
            {imageUrl && (
              <div className="relative mt-2 rounded-2xl overflow-hidden border border-rose-100">
                <img
                  src={imageUrl}
                  alt="Post upload preview"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-72 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  aria-label="Remove image"
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 min-h-[44px] px-3.5 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 cursor-pointer transition-colors">
            <ImagePlus className="w-4 h-4" />
            <span>{uploading ? 'Compressing...' : 'Add Photo'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImagePick}
              className="hidden"
            />
          </label>
          <button
            type="submit"
            disabled={publishing || uploading || (!caption.trim() && !imageUrl)}
            className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white text-xs font-semibold transition-all disabled:opacity-50 whitespace-nowrap"
          >
            {publishing ? 'Posting...' : 'Publish Post'}
          </button>
        </div>
      </form>

      {/* Feed List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-3xl p-5 border border-rose-100 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-rose-100" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 w-32 bg-rose-100 rounded" />
                  <div className="h-3 w-24 bg-zinc-100 rounded" />
                </div>
              </div>
              <div className="h-24 bg-zinc-100 rounded-2xl" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 border border-rose-100 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="font-display text-lg font-bold text-zinc-900">Your feed is genuine and fresh</h3>
          <p className="text-sm text-zinc-500 mt-1.5 max-w-sm mx-auto">
            VibeNexa never fabricates fake posts or bots. Publish the first update above to introduce yourself to real members.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <article
              key={post.id}
              className="bg-white rounded-3xl p-4 sm:p-5 border border-rose-100/80 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onViewProfile(post.authorUid)}
                  className="flex items-center gap-3 text-left min-w-0 group"
                >
                  <UserAvatar photoUrl={post.authorPhotoUrl} name={post.authorName} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm text-zinc-900 group-hover:text-rose-600 truncate">
                        {post.authorName}
                      </span>
                      {post.authorVerified && <VerifiedBadge size={15} />}
                    </div>
                    <p className="text-xs text-zinc-500 truncate">
                      @{post.authorUsername} · {formatRelativeTime(post.createdAt)}
                    </p>
                  </div>
                </button>

                {(post.authorUid === currentUser.uid || currentUser.role === 'SUPER_ADMIN') && (
                  <button
                    type="button"
                    onClick={() => handleDelete(post.id)}
                    aria-label="Delete post"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {post.caption && (
                <p className="mt-3 text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">
                  {post.caption}
                </p>
              )}

              {post.imageUrl && (
                <div className="mt-3 rounded-2xl overflow-hidden bg-rose-50 border border-rose-100/60">
                  <img
                    src={post.imageUrl}
                    alt={`Post by ${post.authorName}`}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[440px] object-cover"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLike(post.id)}
                  className={`min-h-[44px] px-3.5 rounded-xl flex items-center gap-2 text-xs font-semibold transition-colors ${
                    post.likedByMe
                      ? 'text-rose-600 bg-rose-50'
                      : 'text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${post.likedByMe ? 'fill-rose-600' : ''}`} />
                  <span className="tabular-nums">{post.likesCount}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setOpenCommentsId((curr) => (curr === post.id ? null : post.id))
                  }
                  className="min-h-[44px] px-3.5 rounded-xl flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="tabular-nums">{post.comments.length}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleShare(post)}
                  className="min-h-[44px] px-3.5 rounded-xl flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors ml-auto"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>
              </div>

              {/* Comments Section */}
              {openCommentsId === post.id && (
                <div className="mt-3 pt-3 border-t border-zinc-100 space-y-3">
                  {post.comments.length === 0 ? (
                    <p className="text-xs text-zinc-400">No comments yet. Start the conversation.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                      {post.comments.map((c) => (
                        <div key={c.id} className="flex items-start gap-2.5">
                          <button type="button" onClick={() => onViewProfile(c.authorUid)}>
                            <UserAvatar photoUrl={c.authorPhotoUrl} name={c.authorName} size="xs" />
                          </button>
                          <div className="flex-1 bg-zinc-50 rounded-2xl px-3 py-2">
                            <div className="flex items-center gap-1 text-xs">
                              <span className="font-semibold text-zinc-900">{c.authorName}</span>
                              {c.authorVerified && <VerifiedBadge size={12} />}
                              <span className="text-zinc-400">· {formatRelativeTime(c.createdAt)}</span>
                            </div>
                            <p className="text-xs text-zinc-700 mt-0.5">{c.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleComment(post.id);
                        }
                      }}
                      placeholder="Write a comment..."
                      className="flex-1 min-h-[42px] px-3.5 rounded-xl border border-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => handleComment(post.id)}
                      aria-label="Send comment"
                      className="min-h-[42px] min-w-[42px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
