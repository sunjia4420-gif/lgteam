const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session 配置
app.use(session({
  secret: 'shaici-auth-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
}));

// 初始化数据库
db.initDatabase().then(() => {
  console.log('数据库初始化完成');
}).catch(err => {
  console.error('数据库初始化失败:', err);
});

// ============ 工具函数 ============

// 获取客户端 IP
function getClientIP(req) {
  return req.headers['x-forwarded-for'] ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         req.ip ||
         '0.0.0.0';
}

// 验证口令是否有效
async function verifyPassword(password) {
  const pwd = await db.findPasswordByValue(password);
  
  if (!pwd) {
    return { error: '口令错误或无权限' };
  }

  // 检查是否过期
  if (pwd.expires_at) {
    const now = new Date();
    const expiresAt = new Date(pwd.expires_at);
    if (now > expiresAt) {
      return { error: '口令已过期' };
    }
  }

  // 检查使用次数
  if (pwd.max_uses !== null && pwd.used_count >= pwd.max_uses) {
    return { error: '口令使用次数已达上限' };
  }

  return pwd;
}

// 验证管理员权限中间件
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ success: false, message: '需要管理员权限' });
  }
}

// ============ 路由 ============

// 根路径重定向到登录页
app.get('/', (req, res) => {
  res.redirect('/login');
});

// 登录页
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 工具页（需要验证）
app.get('/tool', (req, res) => {
  if (req.session && req.session.passwordId) {
    res.sendFile(path.join(__dirname, 'public', 'tool.html'));
  } else {
    res.redirect('/login');
  }
});

// 品牌检测工具页（需要验证）
app.get('/brand-tool', (req, res) => {
  if (req.session && req.session.passwordId) {
    res.sendFile(path.join(__dirname, 'public', 'brand-tool.html'));
  } else {
    res.redirect('/login');
  }
});

// 管理后台页
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API: 验证口令
app.post('/api/verify', async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.json({ success: false, message: '请输入口令' });
  }

  const result = await verifyPassword(password);

  if (result.error) {
    return res.json({ success: false, message: result.error });
  }

  // 验证成功，设置 session
  req.session.passwordId = result.id;
  req.session.passwordName = result.name;

  // 记录访问日志
  try {
    await db.addLog({
      password_id: result.id,
      password_name: result.name,
      ip_address: getClientIP(req),
      user_agent: req.headers['user-agent'] || ''
    });

    // 增加使用次数
    await db.incrementPasswordUsage(result.id);
  } catch (err) {
    console.error('记录日志失败:', err);
  }

  res.json({ success: true, message: '验证成功' });
});

// API: 检查登录状态
app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.passwordId) {
    res.json({ success: true, passwordName: req.session.passwordName });
  } else {
    res.json({ success: false });
  }
});

// API: 登出
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.json({ success: false });
    }
    res.json({ success: true });
  });
});

// ============ 管理员 API ============

// API: 管理员登录
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.json({ success: false, message: '请输入管理员密码' });
  }

  try {
    const adminPassword = await db.getSetting('admin_password') || 'admin123';

    if (password === adminPassword) {
      req.session.isAdmin = true;
      res.json({ success: true, message: '登录成功' });
    } else {
      res.json({ success: false, message: '管理员密码错误' });
    }
  } catch (err) {
    res.json({ success: false, message: '登录失败' });
  }
});

// API: 管理员登出
app.delete('/api/admin/login', (req, res) => {
  req.session.isAdmin = false;
  res.json({ success: true });
});

// API: 检查管理员登录状态
app.get('/api/admin/check', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// API: 获取访问日志
app.get('/api/admin/logs', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const logs = await db.getLogs(limit, offset);
    const total = await db.getLogsCount();

    res.json({ 
      success: true, 
      logs: logs, 
      total: total 
    });
  } catch (err) {
    res.json({ success: false, message: '获取日志失败' });
  }
});

// API: 获取所有口令
app.get('/api/admin/passwords', requireAdmin, async (req, res) => {
  try {
    const passwords = await db.getPasswords();
    res.json({ success: true, passwords });
  } catch (err) {
    res.json({ success: false, message: '获取口令失败' });
  }
});

// API: 创建口令
app.post('/api/admin/passwords', requireAdmin, async (req, res) => {
  const { name, password, expires_at, max_uses, is_active } = req.body;

  if (!name || !password) {
    return res.json({ success: false, message: '名称和口令不能为空' });
  }

  try {
    const newPassword = await db.addPassword({
      name,
      password,
      expires_at: expires_at || null,
      max_uses: max_uses || null,
      is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1
    });

    res.json({ success: true, id: newPassword.id });
  } catch (err) {
    res.json({ success: false, message: '创建失败: ' + err.message });
  }
});

// API: 更新口令
app.put('/api/admin/passwords/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, password, expires_at, max_uses, is_active } = req.body;

  try {
    const updated = await db.updatePassword(parseInt(id), {
      name,
      password,
      expires_at: expires_at || null,
      max_uses: max_uses || null,
      is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1
    });

    if (updated) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: '口令不存在' });
    }
  } catch (err) {
    res.json({ success: false, message: '更新失败: ' + err.message });
  }
});

// API: 删除口令
app.delete('/api/admin/passwords/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await db.deletePassword(parseInt(id));
    if (deleted) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: '口令不存在' });
    }
  } catch (err) {
    res.json({ success: false, message: '删除失败' });
  }
});

// API: 更新系统设置
app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  const { key, value } = req.body;

  if (!key || !value) {
    return res.json({ success: false, message: '参数不完整' });
  }

  try {
    await db.saveSetting(key, value);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: '更新失败' });
  }
});

// API: 获取系统设置
app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const settings = {};
    const adminPassword = await db.getSetting('admin_password');
    settings.admin_password = adminPassword || 'admin123';
    res.json({ success: true, settings });
  } catch (err) {
    res.json({ success: false, message: '获取设置失败' });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  筛词神器 - 口令登录系统 (Supabase版)');
  console.log('========================================');
  console.log(`  服务地址: http://localhost:${PORT}`);
  console.log(`  登录地址: http://localhost:${PORT}/login`);
  console.log(`  管理后台: http://localhost:${PORT}/admin`);
  console.log('');
  console.log('  默认管理员密码: admin123');
  console.log('');
  console.log('========================================');
  console.log('');
});
