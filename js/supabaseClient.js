/**
 * Supabase Client - Wolflano Tasarım Sitesi
 * https://wgovwmeirlzwalelazfj.supabase.co
 */

const SUPABASE_URL = 'https://wgovwmeirlzwalelazfj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indnb3Z3bWVpcmx6d2FsZWxhemZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MDA4MDAsImV4cCI6MjEwNjA3NjgwMH0.IPM9KBdmxJqz0X8Txh2n9XwvrAaFrU9f1uGBc0l7MQI';

// ============================================
// AUTHENTICATION
// ============================================

async function signUp(email, password, username) {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        email,
        password,
        data: { username }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error_description || 'Kayıt hatası');
    }

    if (data.user) {
      await createUserProfile(data.user.id, email, username);
    }

    return { success: true, data };
  } catch (error) {
    console.error('Sign up error:', error);
    return { success: false, error: error.message };
  }
}

async function signIn(email, password) {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error_description || 'Giriş hatası');
    }

    localStorage.setItem('wolflano_session', JSON.stringify(data));
    localStorage.setItem('wolflano_user_id', data.user.id);

    return { success: true, data };
  } catch (error) {
    console.error('Sign in error:', error);
    return { success: false, error: error.message };
  }
}

async function signOut() {
  try {
    localStorage.removeItem('wolflano_session');
    localStorage.removeItem('wolflano_user_id');
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    return { success: false, error: error.message };
  }
}

async function getCurrentUser() {
  try {
    const session = localStorage.getItem('wolflano_session');
    if (!session) return null;

    const data = JSON.parse(session);
    return data.user || null;
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
}

// ============================================
// USER PROFILES
// ============================================

async function createUserProfile(userId, email, username) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        id: userId,
        email,
        username,
        full_name: username
      })
    });

    if (!response.ok) {
      console.warn('User profile creation skipped');
    }

    return { success: true };
  } catch (error) {
    console.error('Create user profile error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// DESIGNS
// ============================================

async function saveDesign(designData) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanıcı giriş yapmış değil');

    const response = await fetch(`${SUPABASE_URL}/rest/v1/designs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        user_id: user.id,
        name: designData.name || 'Başlıksız Tasarım',
        description: designData.description || '',
        product_type: designData.product_type,
        json_data: designData.json_data,
        thumbnail_url: designData.thumbnail_url || null,
        is_public: designData.is_public || false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Tasarım kayıt hatası');
    }

    return { success: true, data: data[0] };
  } catch (error) {
    console.error('Save design error:', error);
    return { success: false, error: error.message };
  }
}

async function loadDesign(designId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/designs?id=eq.${designId}`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error('Tasarım yükleme hatası');
    }

    return { success: true, data: data[0] };
  } catch (error) {
    console.error('Load design error:', error);
    return { success: false, error: error.message };
  }
}

async function getUserDesigns(limit = 10) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanıcı giriş yapmış değil');

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/designs?user_id=eq.${user.id}&order=created_at.desc&limit=${limit}`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error('Tasarımlar yükleme hatası');
    }

    return { success: true, data };
  } catch (error) {
    console.error('Get user designs error:', error);
    return { success: false, error: error.message };
  }
}

async function deleteDesign(designId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/designs?id=eq.${designId}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Tasarım silme hatası');
    }

    return { success: true };
  } catch (error) {
    console.error('Delete design error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// FAVORITES
// ============================================

async function addToFavorites(designId) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanıcı giriş yapmış değil');

    const response = await fetch(`${SUPABASE_URL}/rest/v1/favorites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        user_id: user.id,
        design_id: designId
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Favori ekleme hatası');
    }

    return { success: true, data: data[0] };
  } catch (error) {
    console.error('Add to favorites error:', error);
    return { success: false, error: error.message };
  }
}

async function removeFromFavorites(designId) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanıcı giriş yapmış değil');

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/favorites?user_id=eq.${user.id}&design_id=eq.${designId}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Favori kaldırma hatası');
    }

    return { success: true };
  } catch (error) {
    console.error('Remove from favorites error:', error);
    return { success: false, error: error.message };
  }
}

async function getUserFavorites() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanıcı giriş yapmış değil');

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/favorites?user_id=eq.${user.id}&order=created_at.desc`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error('Favoriler yükleme hatası');
    }

    return { success: true, data };
  } catch (error) {
    console.error('Get favorites error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// ORDERS
// ============================================

async function createOrder(orderData) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanıcı giriş yapmış değil');

    const response = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        user_id: user.id,
        design_id: orderData.design_id || null,
        product_type: orderData.product_type,
        product_cut: orderData.product_cut,
        product_size: orderData.product_size,
        product_color: orderData.product_color,
        quantity: orderData.quantity,
        unit_price: orderData.unit_price,
        total_price: orderData.total_price,
        shipping_address: orderData.shipping_address || null
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Sipariş oluşturma hatası');
    }

    return { success: true, data: data[0] };
  } catch (error) {
    console.error('Create order error:', error);
    return { success: false, error: error.message };
  }
}

async function getUserOrders() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Kullanıcı giriş yapmış değil');

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?user_id=eq.${user.id}&order=created_at.desc`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error('Siparişler yükleme hatası');
    }

    return { success: true, data };
  } catch (error) {
    console.error('Get orders error:', error);
    return { success: false, error: error.message };
  } 
}
