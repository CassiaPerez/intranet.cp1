import React, { useState, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Calendar, Users } from 'lucide-react';

interface KnowledgeItem {
  id: string;
  pergunta: string;
  palavras_chave: string[];
  resposta: string;
  categoria: string;
}

interface Contact {
  nome: string;
  cargo?: string;
  setor?: string;
  email?: string;
  telefone?: string;
  ramal?: string | number;
  localizacao?: string;
}

interface MenuItem {
  data: string; // dd/MM/yyyy
  prato: string;
  proteina: string;
  acompanhamentos?: string[];
  sobremesa?: string;
}

interface Aniversariante {
  nome: string;
  dataNascimento: string;
  dia: number;
  mesNumero: number;
}

export const ChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: 'Olá! 👋 Sou o assistente virtual da Cropfield.\n\nPosso ajudar com informações sobre:\n🏢 A empresa e setores\n📞 Contatos específicos\n🍽️ Cardápio e proteínas\n📅 Reservas e agendamentos\n🎯 Sistema de pontuação\n🎂 Aniversariantes\n💻 Equipamentos de TI\n\nFaça uma pergunta específica!',
      isBot: true,
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [cardapio, setCardapio] = useState<MenuItem[]>([]);
  const [aniversariantes, setAniversariantes] = useState<Aniversariante[]>([]);
  const [loading, setLoading] = useState(false);

  // Carregar todas as bases de dados da empresa
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[CHATBOT] Loading knowledge base and company data...');
        
        // Base de conhecimento
        const knowledgeResponse = await fetch('/dados/chatbot_knowledge.json');
        if (knowledgeResponse.ok) {
          const knowledgeData = await knowledgeResponse.json();
          setKnowledgeBase(Array.isArray(knowledgeData) ? knowledgeData : []);
          console.log('[CHATBOT] Knowledge base loaded:', knowledgeData?.length, 'items');
        }

        // Contatos
        const contactsResponse = await fetch('/dados/contatos.json');
        if (contactsResponse.ok) {
          const contactsData = await contactsResponse.json();
          const allContacts: Contact[] = [];
          
          // Representantes
          if (Array.isArray(contactsData.representantes)) {
            allContacts.push(...contactsData.representantes.map((rep: any) => ({
              nome: rep.nome,
              cargo: rep.cargo || 'Representante',
              setor: rep.setor || rep.localizacao,
              email: rep.email,
              telefone: rep.telefone,
              ramal: null,
              localizacao: rep.localizacao || rep.setor
            })));
          }
          
          // Equipe Apucarana
          if (Array.isArray(contactsData.equipe_apucarana_pr)) {
            allContacts.push(...contactsData.equipe_apucarana_pr.map((emp: any) => ({
              nome: emp.nome,
              cargo: emp.cargo,
              setor: emp.setor,
              email: emp.email,
              telefone: emp.telefone,
              ramal: emp.ramal,
              localizacao: emp.Cidade || 'Apucarana - PR'
            })));
          }
          
          setContacts(allContacts);
          console.log('[CHATBOT] Contacts loaded:', allContacts.length, 'contacts');
        }

        // Cardápio
        const cardapioResponse = await fetch('/cardapio/cardapio-agosto-padrao.json');
        if (cardapioResponse.ok) {
          const cardapioData = await cardapioResponse.json();
          setCardapio(Array.isArray(cardapioData) ? cardapioData : []);
          console.log('[CHATBOT] Menu loaded:', cardapioData?.length, 'days');
        }

        // Aniversariantes
        const aniversariantesResponse = await fetch('/dados/aniversariantes.json');
        if (aniversariantesResponse.ok) {
          const aniversariantesData = await aniversariantesResponse.json();
          setAniversariantes(Array.isArray(aniversariantesData) ? aniversariantesData : []);
          console.log('[CHATBOT] Birthdays loaded:', aniversariantesData?.length, 'people');
        }

      } catch (error) {
        console.error('[CHATBOT] Error loading data:', error);
      }
    };

    loadData();
  }, []);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const newMessage = {
      id: Date.now(),
      text: inputValue,
      isBot: false,
    };

    setMessages((prev) => [...prev, newMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setLoading(true);

    // Simular delay de processamento mais realista
    setTimeout(() => {
      const botResponse = {
        id: Date.now() + 1,
        text: getBotResponse(currentInput),
        isBot: true,
      };
      setMessages((prev) => [...prev, botResponse]);
      setLoading(false);
    }, 800 + Math.random() * 1200); // 0.8-2s delay
  };

  const getBotResponse = (userMessage: string): string => {
    const message = userMessage.toLowerCase().trim();
    
    console.log('[CHATBOT] Processing question:', userMessage);

    // Análise de intenção específica
    const response = analyzeIntentAndRespond(message, userMessage);
    if (response) return response;

    // Busca inteligente na base de conhecimento
    const bestMatch = findBestMatch(message, knowledgeBase);
    if (bestMatch && bestMatch.score > 0.3) { // Threshold mais alto para melhor precisão
      console.log('[CHATBOT] Knowledge match found:', bestMatch.item.id, 'score:', bestMatch.score);
      return bestMatch.item.resposta;
    }

    // Respostas contextuais baseadas em categoria
    if (isAboutContacts(message)) {
      return handleContactQueries(message);
    }

    if (isAboutMenu(message)) {
      return handleMenuQueries(message, userMessage);
    }

    if (isAboutBirthdays(message)) {
      return handleBirthdayQueries(message);
    }

    if (isAboutCompany(message)) {
      return handleCompanyQueries(message);
    }

    // Sugestões inteligentes quando não entende
    return generateIntelligentFallback(message);
  };

  // Análise avançada de intenção
  const analyzeIntentAndRespond = (message: string, originalMessage: string): string | null => {
    // Perguntas sobre pessoas específicas
    if (message.includes('quem é') || message.includes('quem trabalha') || message.includes('cargo')) {
      return handlePersonQueries(message, originalMessage);
    }

    // Perguntas sobre hoje/amanhã/datas específicas
    if (message.includes('hoje') || message.includes('amanhã') || message.includes('ontem')) {
      return handleDateSpecificQueries(message);
    }

    // Perguntas sobre quantidade/estatísticas
    if (message.includes('quantos') || message.includes('quantas')) {
      return handleQuantityQueries(message);
    }

    // Perguntas sobre localização
    if (message.includes('onde') && (message.includes('fica') || message.includes('encontro'))) {
      return handleLocationQueries(message);
    }

    return null;
  };

  // Handler para perguntas sobre pessoas
  const handlePersonQueries = (message: string, originalMessage: string): string => {
    const extractedNames = extractNames(originalMessage);
    
    if (extractedNames.length > 0) {
      const foundContacts = contacts.filter(c => 
        extractedNames.some(name => 
          c.nome.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(c.nome.toLowerCase().split(' ')[0])
        )
      );
      
      if (foundContacts.length > 0) {
        const person = foundContacts[0];
        let response = `👤 **${person.nome}**\n`;
        
        if (person.cargo) response += `🎯 Cargo: ${person.cargo}\n`;
        if (person.setor) response += `🏢 Setor: ${person.setor}\n`;
        if (person.localizacao) response += `📍 Localização: ${person.localizacao}\n`;
        if (person.email) response += `📧 Email: ${person.email}\n`;
        if (person.telefone) response += `📞 Telefone: ${person.telefone}\n`;
        if (person.ramal) response += `☎️ Ramal: ${person.ramal}\n`;
        
        if (foundContacts.length > 1) {
          response += `\n💡 Encontrei ${foundContacts.length} pessoas com esse nome. Consulte o Diretório para ver todos.`;
        }
        
        return response;
      }
    }
    
    return 'Não encontrei informações sobre essa pessoa. Tente buscar no Diretório Corporativo ou seja mais específico com o nome completo.';
  };

  // Handler para perguntas sobre datas
  const handleDateSpecificQueries = (message: string): string => {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);

    if (message.includes('cardápio') || message.includes('almoço') || message.includes('comida')) {
      const formatDate = (date: Date) => date.toLocaleDateString('pt-BR').replace(/\//g, '/');
      
      let targetDate = '';
      let dateLabel = '';
      
      if (message.includes('hoje')) {
        targetDate = formatDate(hoje);
        dateLabel = 'hoje';
      } else if (message.includes('amanhã')) {
        targetDate = formatDate(amanha);
        dateLabel = 'amanhã';
      } else if (message.includes('ontem')) {
        targetDate = formatDate(ontem);
        dateLabel = 'ontem';
      }
      
      if (targetDate) {
        const menuItem = cardapio.find(item => item.data === targetDate);
        if (menuItem) {
          return `🍽️ **Cardápio de ${dateLabel}** (${targetDate}):\n\n🥘 **Prato**: ${menuItem.prato}\n🥩 **Proteína**: ${menuItem.proteina}\n🥬 **Acompanhamentos**: ${menuItem.acompanhamentos?.join(', ') || 'N/A'}\n🍰 **Sobremesa**: ${menuItem.sobremesa || 'N/A'}`;
        } else {
          return `Não há cardápio disponível para ${dateLabel} (${targetDate}). O cardápio geralmente está disponível apenas para dias úteis.`;
        }
      }
    }

    if (message.includes('aniversário') || message.includes('aniversariante')) {
      const mesAtual = hoje.getMonth() + 1;
      const diaAtual = hoje.getDate();
      
      if (message.includes('hoje')) {
        const aniversariantesHoje = aniversariantes.filter(a => 
          a.mesNumero === mesAtual && a.dia === diaAtual
        );
        
        if (aniversariantesHoje.length > 0) {
          const nomes = aniversariantesHoje.map(a => `🎂 ${a.nome}`).join('\n');
          return `🎉 **Aniversariantes de hoje**:\n\n${nomes}\n\nNão esqueça de parabenizar! 🎈`;
        } else {
          return `Não há aniversariantes hoje (${diaAtual}/${mesAtual}). Consulte o menu 'Aniversariantes' para ver todos do mês.`;
        }
      }
    }

    return `📅 Hoje é ${hoje.toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    })}.\n\nPara informações específicas sobre cardápio, aniversários ou agenda, consulte os menus correspondentes na intranet.`;
  };

  // Handler para perguntas sobre quantidade
  const handleQuantityQueries = (message: string): string => {
    if (message.includes('funcionários') || message.includes('colaboradores') || message.includes('pessoas')) {
      return `👥 Temos ${contacts.length} contatos cadastrados no diretório, incluindo representantes e colaboradores da sede em Apucarana-PR e outras localidades.`;
    }

    if (message.includes('salas')) {
      return `🏢 Temos 4 salas disponíveis para reserva:\n• Aquário (8 pessoas)\n• Grande (20 pessoas) \n• Pequena (6 pessoas)\n• Recepção (4 pessoas)\n\nTotal: 38 lugares para reuniões.`;
    }

    if (message.includes('setores') || message.includes('departamentos')) {
      const setores = [...new Set(contacts.map(c => c.setor).filter(Boolean))];
      return `🏭 Temos ${setores.length} setores principais: ${setores.slice(0, 8).join(', ')}${setores.length > 8 ? ' e outros' : ''}.`;
    }

    if (message.includes('cidades') || message.includes('escritórios')) {
      const cidades = [...new Set(contacts
        .map(c => c.localizacao)
        .filter(Boolean)
        .map(loc => loc?.split(' - ')[0])
      )];
      return `📍 Estamos presentes em ${cidades.length} cidades: ${cidades.slice(0, 6).join(', ')}${cidades.length > 6 ? ' e outras' : ''}.`;
    }

    return null;
  };

  // Handler para perguntas sobre localização
  const handleLocationQueries = (message: string): string => {
    if (message.includes('felipe') || message.includes('gerente administrativo')) {
      const felipe = contacts.find(c => c.nome.toLowerCase().includes('felipe') && c.cargo?.includes('Gerente'));
      if (felipe) {
        return `📍 ${felipe.nome} está localizado em ${felipe.localizacao} e pode ser contactado pelo telefone ${felipe.telefone} ou ramal ${felipe.ramal}.`;
      }
    }

    // Busca geral por localização de pessoas
    const nameMatch = extractNames(message);
    if (nameMatch.length > 0) {
      const person = contacts.find(c => 
        nameMatch.some(name => c.nome.toLowerCase().includes(name.toLowerCase()))
      );
      if (person) {
        return `📍 ${person.nome} está localizado em ${person.localizacao || 'localização não especificada'}.`;
      }
    }

    return 'Especifique sobre qual pessoa ou local você gostaria de saber. Posso ajudar a encontrar a localização de qualquer colaborador.';
  };

  // Handlers especializados
  const handleContactQueries = (message: string): string => {
    // Buscar por setor específico
    const setores = ['rh', 'ti', 'comercial', 'financeiro', 'comex', 'contabilidade', 'crédito', 'faturamento'];
    const setorMencionado = setores.find(setor => message.includes(setor));
    
    if (setorMencionado) {
      const contactsFromSetor = contacts.filter(c => 
        c.setor?.toLowerCase().includes(setorMencionado) ||
        c.cargo?.toLowerCase().includes(setorMencionado)
      );
      
      if (contactsFromSetor.length > 0) {
        const examples = contactsFromSetor.slice(0, 4).map(c => 
          `👤 **${c.nome}** - ${c.cargo}${c.ramal ? ` (Ramal: ${c.ramal})` : ''}${c.telefone ? ` | ${c.telefone}` : ''}`
        ).join('\n');
        
        return `📞 **Contatos do ${setorMencionado.toUpperCase()}** (${contactsFromSetor.length} pessoas):\n\n${examples}${contactsFromSetor.length > 4 ? '\n\n💡 Consulte o Diretório para ver todos os contatos.' : ''}`;
      }
    }

    // Buscar por cidade específica
    const cidades = ['apucarana', 'erechim', 'dourados', 'nova mutum', 'rio verde'];
    const cidadeMencionada = cidades.find(cidade => message.includes(cidade));
    
    if (cidadeMencionada) {
      const contactsFromCidade = contacts.filter(c => 
        c.localizacao?.toLowerCase().includes(cidadeMencionada)
      );
      
      if (contactsFromCidade.length > 0) {
        const examples = contactsFromCidade.slice(0, 3).map(c => 
          `👤 ${c.nome} - ${c.cargo || 'Representante'}`
        ).join('\n');
        
        return `📍 **Equipe em ${cidadeMencionada}** (${contactsFromCidade.length} pessoas):\n\n${examples}${contactsFromCidade.length > 3 ? '\n\nVeja todos no Diretório.' : ''}`;
      }
    }
    
    return 'Você pode encontrar todos os contatos no "Diretório Corporativo" com filtros por setor e cidade. Temos mais de 150 contatos organizados por localização e departamento.';
  };

  const handleMenuQueries = (message: string, originalMessage: string): string => {
    // Buscar por dia específico
    const dayMatch = originalMessage.match(/(\d{1,2})\/(\d{1,2})/);
    if (dayMatch) {
      const [, day, month] = dayMatch;
      const searchDate = `${day.padStart(2, '0')}/${month.padStart(2, '0')}/2025`;
      
      const menuItem = cardapio.find(item => item.data === searchDate);
      if (menuItem) {
        return `🍽️ **Cardápio de ${searchDate}**:\n\n🥘 **Prato**: ${menuItem.prato}\n🥩 **Proteína**: ${menuItem.proteina}\n🥬 **Acompanhamentos**: ${menuItem.acompanhamentos?.join(', ') || 'N/A'}\n🍰 **Sobremesa**: ${menuItem.sobremesa || 'N/A'}`;
      } else {
        return `❌ Não encontrei cardápio para ${searchDate}. Talvez seja um final de semana ou feriado?`;
      }
    }

    // Buscar por proteína específica
    if (message.includes('frango') || message.includes('carne') || message.includes('peixe') || message.includes('porco')) {
      const proteinaBuscada = message.includes('frango') ? 'frango' : 
                            message.includes('carne') ? 'carne' : 
                            message.includes('peixe') ? 'peixe' : 'porco';
      
      const diasComProteina = cardapio.filter(item => 
        item.proteina.toLowerCase().includes(proteinaBuscada)
      );
      
      if (diasComProteina.length > 0) {
        const exemplos = diasComProteina.slice(0, 3).map(item => 
          `📅 ${item.data}: ${item.proteina} (${item.prato})`
        ).join('\n');
        
        return `🥩 **Dias com ${proteinaBuscada}** (${diasComProteina.length} dias encontrados):\n\n${exemplos}${diasComProteina.length > 3 ? '\n\n💡 Consulte o Cardápio completo para ver todos.' : ''}`;
      }
    }

    return 'Consulte o menu "Cardápio" para ver o cardápio completo do mês com todos os pratos, proteínas, acompanhamentos e sobremesas.';
  };

  const handleBirthdayQueries = (message: string): string => {
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1;
    const diaAtual = hoje.getDate();

    if (message.includes('hoje')) {
      const aniversariantesHoje = aniversariantes.filter(a => 
        a.mesNumero === mesAtual && a.dia === diaAtual
      );
      
      if (aniversariantesHoje.length > 0) {
        const nomes = aniversariantesHoje.map(a => `🎂 ${a.nome}`).join('\n');
        return `🎉 **Aniversariantes de hoje**:\n\n${nomes}\n\nNão esqueça de parabenizar! 🎈`;
      } else {
        return `Não há aniversariantes hoje (${diaAtual}/${mesAtual}). 🗓️`;
      }
    }

    if (message.includes('próximos') || message.includes('proximos')) {
      const proximosAniversariantes = aniversariantes
        .filter(a => a.mesNumero === mesAtual && a.dia > diaAtual)
        .sort((a, b) => a.dia - b.dia)
        .slice(0, 5);
      
      if (proximosAniversariantes.length > 0) {
        const lista = proximosAniversariantes.map(a => 
          `🎂 ${a.nome} - ${a.dia}/${a.mesNumero}`
        ).join('\n');
        return `🗓️ **Próximos aniversariantes**:\n\n${lista}`;
      }
    }

    const aniversariantesDoMes = aniversariantes.filter(a => a.mesNumero === mesAtual);
    return `🎂 Este mês temos ${aniversariantesDoMes.length} aniversariantes. Acesse o menu 'Aniversariantes' para ver todos com datas e idades.`;
  };

  const handleCompanyQueries = (message: string): string => {
    if (message.includes('sede') || message.includes('matriz')) {
      return '🏢 Nossa sede fica em **Apucarana - PR**. Lá temos as equipes de Comercial, Comex, Contabilidade, Crédito, Faturamento, Financeiro, RH e TI.';
    }

    if (message.includes('história') || message.includes('fundação')) {
      return '📚 O Grupo Cropfield é uma empresa consolidada no agronegócio brasileiro, com forte presença em tecnologia agrícola e representação comercial. Para mais detalhes históricos, consulte o setor de RH.';
    }

    if (message.includes('missão') || message.includes('valores')) {
      return '🎯 Nossa missão é fornecer soluções inovadoras para o agronegócio brasileiro. Para informações detalhadas sobre missão, visão e valores, consulte o material institucional disponível com o RH.';
    }

    return null;
  };

  // Função melhorada para encontrar correspondências
  const findBestMatch = (userMessage: string, knowledge: KnowledgeItem[]) => {
    let bestMatch = { item: null as KnowledgeItem | null, score: 0 };
    
    for (const item of knowledge) {
      let score = 0;
      
      // Verificar correspondências nas palavras-chave (peso maior)
      for (const keyword of item.palavras_chave) {
        if (userMessage.includes(keyword.toLowerCase())) {
          score += 2; // Peso maior para palavras-chave
        }
      }
      
      // Verificar correspondências na pergunta (peso menor)
      const perguntaWords = item.pergunta.toLowerCase().split(' ');
      for (const word of perguntaWords) {
        if (word.length > 3 && userMessage.includes(word)) {
          score += 0.5;
        }
      }
      
      // Bonus para correspondências múltiplas
      const keywordsFound = item.palavras_chave.filter(keyword => 
        userMessage.includes(keyword.toLowerCase())
      );
      
      if (keywordsFound.length > 1) {
        score += keywordsFound.length * 0.5;
      }
      
      // Bonus para correspondência de categoria
      if (userMessage.includes(item.categoria)) {
        score += 1;
      }
      
      if (score > bestMatch.score) {
        bestMatch = { item, score };
      }
    }
    
    return bestMatch;
  };

  // Funções auxiliares para categorização
  const isAboutContacts = (message: string): boolean => {
    return message.includes('contato') || message.includes('telefone') || 
           message.includes('ramal') || message.includes('email') ||
           message.includes('quem trabalha') || message.includes('setor');
  };

  const isAboutMenu = (message: string): boolean => {
    return message.includes('cardápio') || message.includes('almoço') || 
           message.includes('comida') || message.includes('prato') ||
           message.includes('proteína') || message.includes('menu');
  };

  const isAboutBirthdays = (message: string): boolean => {
    return message.includes('aniversário') || message.includes('aniversariante') ||
           message.includes('birthday') || message.includes('nascimento');
  };

  const isAboutCompany = (message: string): boolean => {
    return message.includes('empresa') || message.includes('cropfield') || 
           message.includes('grupo') || message.includes('negócio') ||
           message.includes('história') || message.includes('sobre');
  };

  // Função para extrair nomes da mensagem
  const extractNames = (message: string): string[] => {
    const words = message.toLowerCase().split(' ');
    const names: string[] = [];
    
    // Buscar após indicadores de pessoa
    const indicators = ['é', 'trabalha', 'está', 'cargo', 'contato'];
    
    for (let i = 0; i < words.length; i++) {
      if (indicators.includes(words[i]) && i < words.length - 1) {
        // Capturar próximas 1-3 palavras como possível nome
        const possibleName = words.slice(i + 1, i + 4).join(' ');
        if (possibleName.length > 2) {
          names.push(possibleName);
        }
      }
    }
    
    // Buscar nomes próprios (palavras capitalizadas no texto original)
    const originalWords = message.split(' ');
    const capitalizedWords = originalWords.filter(word => 
      word.length > 2 && word[0] === word[0].toUpperCase() && 
      !['Como', 'Onde', 'Qual', 'Quem', 'Quando', 'Por'].includes(word)
    );
    
    if (capitalizedWords.length > 0) {
      names.push(...capitalizedWords.map(w => w.toLowerCase()));
    }
    
    return [...new Set(names)]; // Remove duplicatas
  };

  // Fallback inteligente
  const generateIntelligentFallback = (message: string): string => {
    const suggestions = [];
    
    if (message.includes('problema') || message.includes('erro')) {
      suggestions.push('🔧 "Como entro em contato com o TI?"');
      suggestions.push('💻 "Como solicito equipamentos?"');
    }
    
    if (message.includes('pessoa') || message.includes('funcionário')) {
      suggestions.push('👤 "Quem é [nome da pessoa]?"');
      suggestions.push('📞 "Contatos do setor [nome do setor]"');
    }
    
    if (message.includes('data') || message.includes('quando')) {
      suggestions.push('📅 "Qual o cardápio de hoje?"');
      suggestions.push('🎂 "Quem faz aniversário hoje?"');
    }

    const baseSuggestions = [
      '🏢 "Qual o horário da empresa?"',
      '📞 "Contatos do RH"',
      '🍽️ "Cardápio de hoje"',
      '📅 "Como reservo uma sala?"',
      '🎯 "Como funciona a pontuação?"'
    ];

    const allSuggestions = suggestions.length > 0 ? suggestions : baseSuggestions;
    
    return `🤔 Não encontrei uma resposta específica, mas posso ajudar com:\n\n${allSuggestions.slice(0, 4).join('\n')}\n\n💡 **Dica**: Seja específico! Pergunte sobre pessoas, datas, setores ou funcionalidades da intranet.`;
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-2 text-gray-400 hover:text-blue-600 transition-colors"
        title="Assistente Virtual Cropfield"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[600px] flex flex-col">
            {/* Header aprimorado */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-xl">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold">Assistente Cropfield IA</h3>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <p className="text-xs opacity-90">Online • {contacts.length}+ contatos carregados</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages com scroll otimizado */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gradient-to-b from-gray-50 to-white">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isBot ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`flex items-start space-x-3 max-w-[90%] ${message.isBot ? '' : 'flex-row-reverse space-x-reverse'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.isBot ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 'bg-gradient-to-br from-gray-500 to-gray-600'
                    }`}>
                      {message.isBot ? <Bot className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-white" />}
                    </div>
                    <div
                      className={`px-4 py-3 rounded-2xl ${
                        message.isBot
                          ? 'bg-white text-gray-900 shadow-sm border border-gray-100'
                          : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-sm'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.text}</p>
                    </div>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-start space-x-3 max-w-[90%]">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-100">
                      <div className="flex items-center space-x-1">
                        <div className="text-sm text-gray-500 mr-2">Analisando</div>
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input aprimorado */}
            <div className="p-4 border-t bg-white rounded-b-xl">
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !loading && handleSendMessage()}
                  placeholder="Pergunte sobre pessoas, cardápio, reservas, contatos..."
                  disabled={loading}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50 focus:bg-white transition-colors"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={loading || !inputValue.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              
              {/* Sugestões inteligentes */}
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  'Como agendo uma sala?',
                  'Cardápio de hoje',
                  'Contatos do RH', 
                  'Como ganho pontos?',
                  'Aniversariantes hoje'
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInputValue(suggestion)}
                    className="px-3 py-1 text-xs bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 rounded-full hover:from-blue-50 hover:to-blue-100 hover:text-blue-700 transition-all border border-gray-200 hover:border-blue-200"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              
              <div className="mt-2 text-center">
                <p className="text-xs text-gray-500">
                  💡 Pergunte sobre pessoas específicas, datas, setores ou funcionalidades
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};