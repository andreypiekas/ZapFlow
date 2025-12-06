import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'zapflow'}`
});

async function validateUsers() {
  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL\n');

    // Validar usuários na tabela users
    console.log('📋 Validando usuários na tabela `users`:');
    const usersResult = await client.query('SELECT id, username, name, email, role FROM users ORDER BY id');
    
    if (usersResult.rows.length === 0) {
      console.log('   ⚠️  Nenhum usuário encontrado na tabela users');
    } else {
      console.log(`   ✅ Encontrados ${usersResult.rows.length} usuário(s):\n`);
      usersResult.rows.forEach((user, index) => {
        console.log(`   ${index + 1}. ID: ${user.id}`);
        console.log(`      Username: ${user.username}`);
        console.log(`      Nome: ${user.name}`);
        console.log(`      Email: ${user.email}`);
        console.log(`      Role: ${user.role} ${user.role === 'ADMIN' || user.role === 'AGENT' ? '✅' : '⚠️  (deve ser ADMIN ou AGENT)'}`);
        console.log('');
      });
    }

    // Validar usuários salvos no user_data
    console.log('\n📋 Validando usuários salvos no `user_data` (data_type = "users"):');
    const userDataResult = await client.query(`
      SELECT 
        ud.user_id,
        u.username,
        ud.data_key,
        ud.data_value
      FROM user_data ud
      LEFT JOIN users u ON ud.user_id = u.id
      WHERE ud.data_type = 'users'
      ORDER BY ud.user_id, ud.data_key
    `);

    if (userDataResult.rows.length === 0) {
      console.log('   ⚠️  Nenhum usuário encontrado no user_data');
    } else {
      console.log(`   ✅ Encontrados ${userDataResult.rows.length} registro(s) de usuários:\n`);
      
      // Agrupar por user_id
      const usersByUserId = {};
      userDataResult.rows.forEach(row => {
        if (!usersByUserId[row.user_id]) {
          usersByUserId[row.user_id] = {
            username: row.username || 'N/A',
            data: {}
          };
        }
        usersByUserId[row.user_id].data[row.data_key] = row.data_value;
      });

      Object.entries(usersByUserId).forEach(([userId, userInfo]) => {
        console.log(`   👤 Usuário ID: ${userId} (${userInfo.username})`);
        
        // Tentar parsear o data_value se for uma string JSON
        try {
          const userData = typeof userInfo.data.default === 'string' 
            ? JSON.parse(userInfo.data.default) 
            : userInfo.data.default;
          
          if (Array.isArray(userData)) {
            console.log(`      📊 Total de usuários salvos: ${userData.length}`);
            userData.forEach((user, index) => {
              const role = user.role || 'N/A';
              const isValidRole = role === 'ADMIN' || role === 'AGENT';
              console.log(`      ${index + 1}. ${user.name || 'Sem nome'} (${user.email || 'Sem email'}) - Role: ${role} ${isValidRole ? '✅' : '⚠️  (deve ser ADMIN ou AGENT)'}`);
            });
          } else if (userData && typeof userData === 'object') {
            const role = userData.role || 'N/A';
            const isValidRole = role === 'ADMIN' || role === 'AGENT';
            console.log(`      Nome: ${userData.name || 'N/A'}`);
            console.log(`      Email: ${userData.email || 'N/A'}`);
            console.log(`      Role: ${role} ${isValidRole ? '✅' : '⚠️  (deve ser ADMIN ou AGENT)'}`);
          }
        } catch (error) {
          console.log(`      ⚠️  Erro ao parsear dados: ${error.message}`);
        }
        console.log('');
      });
    }

    // Verificar inconsistências
    console.log('\n🔍 Verificando inconsistências:');
    const issues = [];
    
    // Verificar se há roles inválidos na tabela users
    const invalidRoles = usersResult.rows.filter(u => u.role !== 'ADMIN' && u.role !== 'AGENT');
    if (invalidRoles.length > 0) {
      issues.push(`⚠️  ${invalidRoles.length} usuário(s) na tabela users com role inválido: ${invalidRoles.map(u => u.username).join(', ')}`);
    }

    // Verificar se o admin tem role ADMIN
    const admin = usersResult.rows.find(u => u.username === 'admin@piekas.com');
    if (admin && admin.role !== 'ADMIN') {
      issues.push(`⚠️  Usuário admin@piekas.com não tem role ADMIN (atual: ${admin.role})`);
    }

    if (issues.length === 0) {
      console.log('   ✅ Nenhuma inconsistência encontrada!');
    } else {
      issues.forEach(issue => console.log(`   ${issue}`));
    }

    console.log('\n✅ Validação concluída!');
  } catch (error) {
    console.error('❌ Erro na validação:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

validateUsers();

