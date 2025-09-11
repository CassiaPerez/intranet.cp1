import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Plus, ThumbsUp, MessageCircle, Calendar, User, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/,''); // sem barra final

interface Post {
  id: string;
  titulo: string;
  conteudo: string;
  author: string;
  pinned: boolean;
  created_at: string;
  likes_count: number;
  comments_count: number;
}

interface Comment {
  id: string;
  texto: string;
  author: string;
  created_at: string;
}

const apiUrl = (p: string) => `${API_BASE}${p}`;

export const Mural: React.FC = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [newPost, setNewPost] = useState({ titulo: '', conteudo: '', pinned: false });
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [postComments, setPostComments] = useState<Record<string, Comment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});

  const canPost =
    user?.setor === 'TI' || user?.setor === 'RH' || user?.role === 'admin' || user?.role === 'moderador';
  const canModerate =
    user?.role === 'admin' || user?.role === 'moderador' || user?.setor === 'TI';

  useEffect(() => { loadPosts(); }, []);

  const sortPosts = (arr: Post[]) =>
    [...arr].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; // fixados primeiro
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // mais recentes
    });

  const loadPosts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/mural/posts', { 
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPosts(sortPosts(data.posts || []));
    } catch (e: any) {
      console.error('[MURAL] Error loading posts:', e);
      toast.error('Erro ao carregar posts do mural');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.titulo.trim() || !newPost.conteudo.trim()) {
      toast.error('Preencha todos os campos!');
      return;
    }
    try {
      const res = await fetch('/api/mural/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newPost),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success('Publicação criada com sucesso!');
      setNewPost({ titulo: '', conteudo: '', pinned: false });
      setShowNewPostModal(false);
      await loadPosts();
    } catch (e: any) {
      console.error('[MURAL] Error creating post:', e);
      toast.error(e.message || 'Erro ao criar publicação');
    }
  };

  const handleReaction = async (postId: string) => {
    try {
      const res = await fetch(`/api/mural/${postId}/like`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      toast.success(data.action === 'liked' ? 'Post curtido!' : 'Curtida removida!');
      await loadPosts();
    } catch (e) {
      console.error('[MURAL] Error processing reaction:', e);
      toast.error('Erro ao processar reação');
    }
  };

  const handleComment = async (postId: string) => {
    const commentText = (commentTexts[postId] || '').trim();
    if (!commentText) return;
    try {
      const res = await fetch(`/api/mural/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ texto: commentText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[MURAL] Comment failed:', res.status, err);
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setCommentTexts(prev => ({ ...prev, [postId]: '' }));
      toast.success('Comentário adicionado!');
      await loadPosts();            // atualiza contagem
      await loadComments(postId);   // reabrir comentários atualizados
    } catch (e: any) {
      console.error('[MURAL] Error creating comment:', e);
      toast.error(e.message || 'Erro ao adicionar comentário');
    }
  };

  const loadComments = async (postId: string) => {
    // Toggle se já estiver carregado
    if (postComments[postId]) {
      setPostComments(prev => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
      return;
    }
    try {
      setLoadingComments(prev => ({ ...prev, [postId]: true }));
      const res = await fetch(`/api/mural/${postId}/comments`, { 
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPostComments(prev => ({ ...prev, [postId]: data.comments || [] }));
    } catch (e) {
      console.error('[MURAL] Error loading comments:', e);
      toast.error('Erro ao carregar comentários');
    } finally {
      setLoadingComments(prev => ({ ...prev, [postId]: false }));
    }
  };

  const handleDeleteComment = async (commentId: string, postId: string) => {
    if (!confirm('Tem certeza que deseja excluir este comentário?')) return;
    try {
      const res = await fetch(`/api/mural/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      toast.success(data.message || 'Comentário removido com sucesso');
      setPostComments(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).filter(c => c.id !== commentId),
      }));
      await loadPosts(); // atualiza contagem
    } catch (e: any) {
      console.error('[MURAL] Error deleting comment:', e);
      toast.error(e.message || 'Erro ao excluir comentário');
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy HH:mm', { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Mural de Informações</h1>
          {canPost && (
            <button
              onClick={() => setShowNewPostModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Publicação</span>
            </button>
          )}
        </div>

        {!canPost && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <MessageCircle className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="text-sm font-medium text-blue-900">Visualização do Mural</h3>
                <p className="text-sm text-blue-700">
                  Você pode visualizar, curtir e comentar as publicações. Apenas membros do RH, TI, Moderadores e
                  Administradores podem criar novas publicações.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
          ) : posts.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhuma publicação ainda</h3>
              <p className="text-gray-600">
                {canPost ? 'Seja o primeiro a criar uma publicação!' : 'Aguarde novas publicações da equipe.'}
              </p>
            </div>
          ) : (
            posts.map(post => (
              <div key={post.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{post.author}</h3>
                      <div className="flex items-center space-x-2 text-sm text-gray-500">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(post.created_at)}</span>
                        {post.pinned && (
                          <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Fixado</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">{post.titulo}</h2>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{post.conteudo}</p>
                </div>

                <div className="flex items-center space-x-4 mb-4 pb-4 border-b border-gray-100">
                  <button
                    onClick={() => handleReaction(post.id)}
                    className="flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors hover:bg-blue-50 text-blue-600"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span className="text-sm font-medium">{post.likes_count || 0}</span>
                  </button>

                  <div className="flex items-center space-x-2 text-gray-500">
                    <MessageCircle className="w-4 h-4" />
                    <button
                      onClick={() => loadComments(post.id)}
                      className="text-sm hover:text-blue-600 transition-colors"
                    >
                      {post.comments_count || 0} comentários
                    </button>
                  </div>
                </div>

                {postComments[post.id] && (
                  <div className="mt-4 space-y-3">
                    {postComments[post.id].map(comment => (
                      <div key={comment.id} className="flex space-x-3 bg-gray-50 rounded-lg p-3 group">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-sm font-medium text-gray-900">{comment.author}</span>
                            <span className="text-xs text-gray-500">{formatDate(comment.created_at)}</span>
                            {canModerate && (
                              <button
                                onClick={() => handleDeleteComment(comment.id, post.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 p-1"
                                title="Excluir comentário"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-gray-700">{comment.texto}</p>
                        </div>
                      </div>
                    ))}
                    {loadingComments[post.id] && (
                      <div className="flex items-center justify-center py-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex space-x-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 flex space-x-2">
                    <input
                      type="text"
                      value={commentTexts[post.id] || ''}
                      onChange={(e) => setCommentTexts(prev => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleComment(post.id)}  // onKeyPress -> onKeyDown
                      placeholder="Escreva um comentário..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                    <button
                      onClick={() => handleComment(post.id)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {showNewPostModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Nova Publicação</h2>
                <form onSubmit={handleCreatePost} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Título</label>
                    <input
                      type="text"
                      value={newPost.titulo}
                      onChange={(e) => setNewPost({ ...newPost, titulo: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Digite o título da publicação..."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Conteúdo</label>
                    <textarea
                      value={newPost.conteudo}
                      onChange={(e) => setNewPost({ ...newPost, conteudo: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={6}
                      placeholder="Escreva o conteúdo da publicação..."
                      required
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="pinned"
                      checked={newPost.pinned}
                      onChange={(e) => setNewPost({ ...newPost, pinned: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="pinned" className="text-sm text-gray-700">Fixar publicação no topo</label>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowNewPostModal(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Publicar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
