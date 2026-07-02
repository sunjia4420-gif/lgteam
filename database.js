const { createClient } = require('@supabase/supabase-js');

// Supabase 配置（从环境变量读取，默认值用于本地开发）
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wgjhijtfhqtkdgddtcwh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_4JkQtzY24ldcGfE7BcZs0Q_hdN1Ms-e';

// 创建 Supabase 客户端
// 注意：这里先用 anon key，如果表禁用了 RLS 就可以直接用
// 如果启用了 RLS，需要换成 service_role key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============ 口令操作 ============

// 获取所有口令
async function getPasswords() {
  const { data, error } = await supabase
    .from('passwords')
    .select('*')
    .order('id', { ascending: true });
  
  if (error) {
    console.error('获取口令失败:', error);
    return [];
  }
  
  return data || [];
}

// 根据口令值查找口令
async function findPasswordByValue(passwordValue) {
  const { data, error } = await supabase
    .from('passwords')
    .select('*')
    .eq('password', passwordValue)
    .eq('is_active', 1)
    .single();
  
  if (error) {
    if (error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('查找口令失败:', error);
    }
    return null;
  }
  
  return data;
}

// 根据 ID 查找口令
async function findPasswordById(id) {
  const { data, error } = await supabase
    .from('passwords')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    console.error('查找口令失败:', error);
    return null;
  }
  
  return data;
}

// 添加口令
async function addPassword(passwordData) {
  const { data, error } = await supabase
    .from('passwords')
    .insert([
      {
        name: passwordData.name,
        password: passwordData.password,
        expires_at: passwordData.expires_at || null,
        max_uses: passwordData.max_uses || null,
        used_count: 0,
        is_active: passwordData.is_active !== undefined ? passwordData.is_active : 1
      }
    ])
    .select()
    .single();
  
  if (error) {
    console.error('添加口令失败:', error);
    throw error;
  }
  
  return data;
}

// 更新口令
async function updatePassword(id, passwordData) {
  const { data, error } = await supabase
    .from('passwords')
    .update(passwordData)
    .eq('id', id)
    .select()
    .single();
  
  if (error) {
    console.error('更新口令失败:', error);
    return null;
  }
  
  return data;
}

// 删除口令
async function deletePassword(id) {
  const { error } = await supabase
    .from('passwords')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('删除口令失败:', error);
    return false;
  }
  
  return true;
}

// 增加口令使用次数
async function incrementPasswordUsage(id) {
  // 先获取当前值
  const { data: current, error: fetchError } = await supabase
    .from('passwords')
    .select('used_count')
    .eq('id', id)
    .single();
  
  if (fetchError) {
    console.error('获取使用次数失败:', fetchError);
    return;
  }
  
  // 再更新
  const { error } = await supabase
    .from('passwords')
    .update({ used_count: (current.used_count || 0) + 1 })
    .eq('id', id);
  
  if (error) {
    console.error('更新使用次数失败:', error);
  }
}

// ============ 访问日志操作 ============

// 获取所有日志
async function getLogs(limit = 100, offset = 0) {
  const { data, error } = await supabase
    .from('access_logs')
    .select('*')
    .order('accessed_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (error) {
    console.error('获取日志失败:', error);
    return [];
  }
  
  return data || [];
}

// 获取日志总数
async function getLogsCount() {
  const { count, error } = await supabase
    .from('access_logs')
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    console.error('获取日志总数失败:', error);
    return 0;
  }
  
  return count || 0;
}

// 添加日志
async function addLog(logData) {
  const { data, error } = await supabase
    .from('access_logs')
    .insert([
      {
        password_id: logData.password_id,
        password_name: logData.password_name,
        ip_address: logData.ip_address,
        user_agent: logData.user_agent || ''
      }
    ])
    .select()
    .single();
  
  if (error) {
    console.error('添加日志失败:', error);
    throw error;
  }
  
  return data;
}

// ============ 设置操作 ============

// 获取设置值
async function getSetting(key) {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .single();
  
  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('获取设置失败:', error);
    }
    return null;
  }
  
  return data.value;
}

// 保存设置
async function saveSetting(key, value) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value }, { onConflict: 'key' });
  
  if (error) {
    console.error('保存设置失败:', error);
    throw error;
  }
  
  return true;
}

// ============ 初始化 ============

// 初始化数据库（检查是否有默认数据）
async function initDatabase() {
  console.log('正在检查数据库...');
  
  try {
    // 检查是否有口令
    const passwords = await getPasswords();
    
    if (passwords.length === 0) {
      console.log('创建默认口令...');
      await addPassword({ name: '测试口令1', password: 'test001', is_active: 1 });
      await addPassword({ name: '测试口令2', password: 'test002', is_active: 1 });
      console.log('✓ 默认口令已创建');
    }
    
    // 检查是否有管理员密码设置
    const adminPassword = await getSetting('admin_password');
    if (!adminPassword) {
      console.log('创建默认管理员密码...');
      await saveSetting('admin_password', 'admin123');
      console.log('✓ 默认管理员密码已创建');
    }
    
    console.log('数据库检查完成');
  } catch (err) {
    console.error('数据库初始化失败:', err);
    console.log('提示：请确保 Supabase 表已创建，且 RLS 已禁用或已配置策略');
  }
}

module.exports = {
  getPasswords,
  findPasswordByValue,
  findPasswordById,
  addPassword,
  updatePassword,
  deletePassword,
  incrementPasswordUsage,
  getLogs,
  getLogsCount,
  addLog,
  getSetting,
  saveSetting,
  initDatabase
};
