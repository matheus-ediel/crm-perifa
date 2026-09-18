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

  // Tratar arquivos - suporta formato antigo (image única) e novo (files array)
  let files = [];

  // Se já existe o campo files (novo formato)
  if (row.files && Array.isArray(row.files)) {
    files = row.files;
  } else {
    // Migrar do formato antigo: image + imageName
    if (row.image) {
      files.push({
        url: row.image,
        name: row.imagename || 'imagem',
        type: row.imagename?.endsWith('.pdf') ? 'application/pdf' :
              row.imagename?.endsWith('.mp4') ? 'video/mp4' :
              row.imagename?.endsWith('.doc') ? 'application/msword' : 'image/jpeg'
      });
    }
    // Também migrar de arquivo_nome (outro formato antigo)
    if (row.arquivo_nome && !row.image) {
      files.push({
        url: row.arquivo_thumb || null,
        name: row.arquivo_nome,
        type: row.arquivo_tipo || 'image/jpeg'
      });
    }
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
    // Campos antigos para compatibilidade
    image: files.length > 0 ? files[0].url : null,
    imageName: files.length > 0 ? files[0].name : '',
    // Novo campo com múltiplos arquivos
    files: files,
    alt: row.alt || '',
    history: history,
    createdAt: row.createdat || row.createdAt,
    updatedAt: row.updatedat || row.updatedAt
  };
}

// Transformar dados do front-end para formato do banco
function transformToDB(demanda) {
  // Salvar como array de arquivos
  let files = demanda.files || [];

  // Se tem arquivo único antigo mas não tem files array, migrar
  if (files.length === 0 && demanda.image) {
    files = [{
      url: demanda.image,
      name: demanda.imageName || 'imagem',
      type: demanda.imageName?.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
    }];
  }

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
    // Campos antigos para compatibilidade
    image: files.length > 0 ? files[0].url : null,
    imagename: files.length > 0 ? files[0].name : null,
    // Novo campo com múltiplos arquivos
    files: files,
    history: demanda.history || [],
    createdat: demanda.createdAt,
    updatedat: new Date().toISOString(),
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
      const comArquivos = demandas.filter(d => d.files && d.files.length > 0).length;
      console.log('📎 ' + comArquivos + ' demandas com arquivos');
    } else {
      throw new Error('No data');
    }
  } catch (err) {
    console.error('Erro ao carregar do Supabase:', err);
    // Tentar localStorage
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        demandas = JSON.parse(saved);
      } else if (typeof DEFAULT_DEMANDAS !== 'undefined') {
        demandas = JSON.parse(JSON.stringify(DEFAULT_DEMANDAS));
      } else {
        console.log('Sem dados disponíveis');
        demandas = [];
      }
    } catch (e) {
      if (typeof DEFAULT_DEMANDAS !== 'undefined') {
        demandas = JSON.parse(JSON.stringify(DEFAULT_DEMANDAS));
      } else {
        demandas = [];
      }
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
    const comArquivos = demandas.filter(d => d.files && d.files.length > 0).length;
    if (comArquivos > 0) {
      console.log('📎 ' + comArquivos + ' demandas com arquivos');
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

// Sobrescrever uploadImageToServer para retornar array de arquivos
window.uploadImageToServer = async function(filesData, filenames) {
  // filesData é um array de {base64, filename}
  // Retorna array de URLs (neste caso, os próprios base64)
  console.log('📷 Salvando ' + filesData.length + ' arquivo(s) em base64...');
  return filesData.map((base64, i) => ({
    url: base64,
    name: filenames[i] || 'arquivo',
    type: filenames[i]?.endsWith('.pdf') ? 'application/pdf' :
          filenames[i]?.endsWith('.mp4') ? 'video/mp4' :
          filenames[i]?.endsWith('.doc') ? 'application/msword' : 'image/jpeg'
  }));
};

console.log('🚀 CRM Perifa - Conectado ao Supabase (Múltiplos Arquivos)');
