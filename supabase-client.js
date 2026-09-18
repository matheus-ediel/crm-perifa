// Configuração do Supabase
const SUPABASE_URL = 'https://osrxyshcmaazppqwrtlt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zcnh5c2hjbWFhenBwcXdydGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MTkwNDksImV4cCI6MjEwNTI5NTA0OX0.bVBWuZwonazqLLowDEKINf4drpAnZX_mMFeatMGhIO4';

// Helper para requisições ao Supabase
async function supabaseRequest(path, options = {}) {
  const { method = 'GET', body } = options;

  let url = `${SUPABASE_URL}/rest/v1${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': method === 'POST' ? 'return=representation' : 'count=none'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  return response.json();
}

// Transformar dados do banco para formato do front-end
function transformFromDB(row) {
  // Tratar history
  let history = row.history || [];
  if (typeof history === 'string') {
    try { history = JSON.parse(history); } catch { history = []; }
  }

  // Tratar arquivo
  let arquivo = {
    tipo: row.arquivo_tipo || null,
    thumb: row.arquivo_thumb || null,
    nome: row.arquivo_nome || null
  };
  if (typeof row.arquivo === 'string') {
    try { arquivo = JSON.parse(row.arquivo); } catch {}
  }

  return {
    id: row.id,
    titulo: row.titulo,
    cliente: row.cliente,
    pilar: row.pilar,
    tipo: row.tipo,
    canal: row.canal,
    status: row.status,
    data: row.data,
    descricao: row.descricao || '',
    copy: row.copy || '',
    arquivo: arquivo,
    // Image vem do campo 'image' que é base64
    image: row.image || arquivo?.thumb || null,
    imageName: row.imagename || arquivo?.nome || '',
    alt: row.alt || '',
    history: history,
    createdAt: row.createdat || row.createdAt,
    updatedAt: row.updatedat || row.updatedAt
  };
}

// Transformar dados do front-end para formato do banco
function transformToDB(demanda) {
  return {
    id: demanda.id,
    titulo: demanda.titulo,
    cliente: demanda.cliente,
    pilar: demanda.pilar,
    tipo: demanda.tipo,
    canal: demanda.canal,
    status: demanda.status,
    data: demanda.data,
    descricao: demanda.descricao || '',
    copy: demanda.copy || '',
    arquivo_tipo: demanda.arquivo?.tipo || null,
    arquivo_thumb: demanda.arquivo?.thumb || null,
    arquivo_nome: demanda.arquivo?.nome || null,
    history: demanda.history || [],
    createdat: demanda.createdAt,
    updatedat: new Date().toISOString(),
    // Image é o base64 direto - isso é o que falta!
    image: demanda.image || null,
    imagename: demanda.imageName || null,
    alt: demanda.alt || null
  };
}

// Sobrescrever loadData
const originalLoadData = window.loadData;
window.loadData = async function() {
  try {
    const data = await supabaseRequest('/demandas?select=*&order=id.asc');

    if (data && data.length > 0) {
      demandas = data.map(transformFromDB);
      isOnline = true;
      updateConnectionStatus();
      renderAll();
      console.log('📊 ' + demandas.length + ' demandas carregadas do Supabase');
      const comImagens = demandas.filter(d => d.image).length;
      console.log('🖼️  ' + comImagens + ' demandas com imagem');
    } else {
      throw new Error('No data');
    }
  } catch (err) {
    console.error('Erro ao carregar do Supabase:', err);
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        demandas = JSON.parse(saved);
      } else {
        demandas = JSON.parse(JSON.stringify(DEFAULT_DEMANDAS));
      }
    } catch (e) {
      demandas = JSON.parse(JSON.stringify(DEFAULT_DEMANDAS));
    }
    isOnline = false;
    updateConnectionStatus();
    renderAll();
  }
};

// Sobrescrever saveData
const originalSaveData = window.saveData;
window.saveData = async function() {
  try {
    // Buscar IDs existentes
    const existing = await supabaseRequest('/demandas?select=id');

    // Deletar existentes
    if (existing && existing.length > 0) {
      const ids = existing.map(d => d.id);
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        await fetch(`${SUPABASE_URL}/rest/v1/demandas?id=in.(${batch.join(',')})`, {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        });
      }
    }

    // Inserir todos
    for (const demanda of demandas) {
      const dbData = transformToDB(demanda);
      await supabaseRequest('/demandas', { method: 'POST', body: dbData });
    }

    console.log('💾 ' + demandas.length + ' demandas salvas no Supabase');
    const comImagens = demandas.filter(d => d.image).length;
    if (comImagens > 0) {
      console.log('🖼️  ' + comImagens + ' demandas com imagem salva');
    }
  } catch (err) {
    console.error('Erro ao salvar no Supabase:', err);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demandas));
  }

  // Atualiza timestamp
  var lastSaveEl = document.getElementById('last-save');
  if (lastSaveEl) {
    lastSaveEl.textContent = new Date().toLocaleString('pt-BR');
  }
};

// Sobrescrever uploadImageToServer para usar base64 diretamente
window.uploadImageToServer = async function(base64Data, filename) {
  // No Vercel, salvamos a imagem em base64 diretamente na demanda
  // Retornamos o próprio base64 como "URL"
  console.log('📷 Salvando imagem em base64 diretamente...');
  return base64Data; // Retorna o próprio base64 como "URL"
};

console.log('🚀 CRM Perifa - Conectado ao Supabase (Vercel)');
