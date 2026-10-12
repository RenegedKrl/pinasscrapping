/**
 * Simulador de Conversa Automática com Gemini AI (Pinas Prospector)
 * Testa o fluxo completo de uma conversa real pelo WhatsApp:
 * Lead responde -> IA analisa intenção -> IA responde na voz do Kauê -> conduz até agendar no Google Meet
 */

const gemini = require('./gemini');

async function simularConversa() {
  console.log('================================================================');
  console.log('🤖 SIMULADOR DE PROSPECÇÃO CONVERSACIONAL (GEMINI 2.5 FLASH)');
  console.log('================================================================\n');

  // Lead minerado de exemplo
  const leadSimulado = {
    name: 'Centro Veterinário Vila Mariana',
    niche: 'Clínica Veterinária',
    neighborhood: 'Vila Mariana',
    city: 'São Paulo',
    hasWebsite: false,
    rating: 4.9,
    reviews: 58,
    phone: '(11) 98765-4321'
  };

  console.log(`📌 Lead: ${leadSimulado.name}`);
  console.log(`📍 Região: ${leadSimulado.neighborhood} - SP | Avaliação: ★ ${leadSimulado.rating} (${leadSimulado.reviews} reviews)`);
  console.log(`🌐 Presença: Sem site próprio\n`);

  // Mensagem inicial de abertura enviada pelo Kauê (100% despretensiosa, sem cara de venda)
  const mensagensChat = [
    {
      fromMe: true,
      text: 'Olá, tudo bem? É da clínica Centro Veterinário Vila Mariana?'
    }
  ];

  console.log(`[Kauê (Pinas)]: "${mensagensChat[0].text}"\n`);

  // Simulação de turnos de resposta do cliente
  const respostasDoCliente = [
    'Olá! Sou eu mesmo, o Dr. Roberto. Do que se trata?',
    'Entendi. Mas quanto custa isso mais ou menos? Já tenho muita gente me oferecendo marketing.',
    'Legal. Pode ser amanhã às 15h sim. Como fazemos?',
    'Meu email é contato@vetvilamariana.com.br. Valeu!'
  ];

  for (let i = 0; i < respostasDoCliente.length; i++) {
    const textoCliente = respostasDoCliente[i];
    console.log(`----------------------------------------------------------------`);
    console.log(`💬 TURNO ${i + 1}`);
    console.log(`👤 [Dr. Roberto]: "${textoCliente}"`);

    mensagensChat.push({
      fromMe: false,
      text: textoCliente
    });

    console.log(`🧠 [Gemini pensando na melhor resposta na voz do Kauê...]`);
    const respostaIa = await gemini.generateAutoPilotReply({
      lead: leadSimulado,
      messages: mensagensChat,
      lastIncomingMessage: textoCliente
    });

    console.log(`🎯 Intenção Detectada: ${respostaIa.detectedIntent}`);
    console.log(`💡 Ação: ${respostaIa.action}`);
    console.log(`📝 Justificativa da IA: ${respostaIa.reasoning}`);
    console.log(`\n🚀 [Kauê (IA)]: "${respostaIa.replyText}"\n`);

    mensagensChat.push({
      fromMe: true,
      text: respostaIa.replyText
    });
  }

  console.log('================================================================');
  console.log('🎉 SIMULAÇÃO FINALIZADA: REUNIÃO NO GOOGLE MEET AGENDADA!');
  console.log('================================================================');
}

simularConversa().catch(console.error);
