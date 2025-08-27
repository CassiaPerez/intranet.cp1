import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Plus, Heart, ThumbsUp, MessageCircle, Calendar, User, Edit3, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || '';

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

export const Mural: React.FC = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [newPost, setNewPost] = useState({
    titulo: '',
    conteudo: '',
    pinned: false,
  });
  const [commentTexts, setCommentTexts] = useState<{ [key: string]: string }>({});
  
  const canPost = user?.setor === 'TI' || user?.setor === 'RH' || user?.role === 'admin';
  
  // Debug user permissions
  console.log('[MURAL] User permissions check:', {
    user: user?.name,
    setor: user?.setor,
    role: user?.role,
    canPost
  });

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      setLoading(true);
      console.log('[MURAL] Loading posts...');
      const response = await fetch('/api/mural/posts', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('[MURAL] Posts loaded:', data.posts?.length || 0);
      setPosts(data.posts || []);
    } catch (error) {
      console.error('[MURAL] Error loading posts:', error);
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
      console.log('[MURAL] Creating post:', newPost);
      const response = await fetch('/api/mural/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(newPost),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('[MURAL] Post created with ID:', data.id);
      
      setNewPost({ titulo: '', conteudo: '', pinned: false });
      setShowNewPostModal(false);
      toast.success('Publicação criada com sucesso!');
      
      // Reload posts to show the new one
      await loadPosts();
    } catch (error) {
      console.error('[MURAL] Error creating post:', error);
      toast.error(error.message || 'Erro ao criar publicação');
    }
  };

  const handleReaction = async (postId: string) => {
    try {
      console.log('[MURAL] Processing like for post:', postId);
      const response = await fetch(`/api/mural/${postId}/like`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('[MURAL] Like processed:', data.action);
      
      if (data.points) {
        toast.success(`${data.action === 'liked' ? 'Curtida' : 'Descurtida'} registrada! +${data.points} pontos`);
      } else {
        toast.success(data.action === 'liked' ? 'Post curtido!' : 'Curtida removida!');
      }
      
      // Reload posts to update counts
      await loadPosts();
    } catch (error) {
      console.error('[MURAL] Error processing reaction:', error);
      toast.error('Erro ao processar reação');
    }
  };

  const handleComment = async (postId: string) => {
    const commentText = commentTexts[postId];
    if (!commentText?.trim()) return;

    try {
      console.log('[MURAL] Creating comment for post:', postId);
      const response = await fetch(`/api/mural/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ texto: commentText.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[MURAL] Comment failed:', response.status, errorData);
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('[MURAL] Comment created with ID:', data.id);
      
      setCommentTexts(prev => ({ ...prev, [postId]: '' }));
      
      if (data.points) {
        toast.success(`Comentário adicionado! +${data.points} pontos`);
      } else {
        toast.success('Comentário adicionado!');
      }
      
      // Reload posts to update counts
      await loadPosts();
    } catch (error) {
      console.error('[MURAL] Error creating comment:', error);
      toast.error('Erro ao adicionar comentário');
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

        {/* Posts Feed */}
        <div className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
            posts.map((post) => (
              <div key={post.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                {/* Post Header */}
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
                          <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                            Fixado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Post Content */}
                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">{post.titulo}</h2>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{post.conteudo}</p>
                </div>

                {/* Reactions */}
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
                    <span className="text-sm">{post.comments_count || 0} comentários</span>
                  </div>
                </div>

                {/* Add Comment */}
                <div className="flex space-x-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 flex space-x-2">
                    <input
                      type="text"
                      value={commentTexts[post.id] || ''}
                      onChange={(e) => setCommentTexts(prev => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyPress={(e) => e.key === 'Enter' && handleComment(post.id)}
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

        {/* New Post Modal */}
        {showNewPostModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Nova Publicação</h2>
                <form onSubmit={handleCreatePost} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Título
                    </label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Conteúdo
                    </label>
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