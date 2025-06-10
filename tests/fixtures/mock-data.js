export const mockPlaintextData = `john.doe@example.com:password123:johndoe:John Doe
jane.smith@test.org:secretpass:jsmith:Jane Smith
admin@secure.net:adminpass:admin:Administrator
user@demo.com:demopass:demouser:Demo User`;

export const mockShardData = {
  '0': `john.doe@example.com:hash1:data1
admin@secure.net:hash3:data3`,
  '1': `jane.smith@test.org:hash2:data2
user@demo.com:hash4:data4`
};

export const mockPostgresRows = [
  {
    email_norm: 'john.doe@example.com',
    breach_name: 'Example Corp Breach',
    breach_date: new Date('2023-01-15'),
    password_hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    data_types: ['email', 'password', 'username'],
    affected_count: 1000000
  },
  {
    email_norm: 'jane.smith@test.org',
    breach_name: 'Test Site Leak',
    breach_date: new Date('2023-03-22'),
    password_hash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
    data_types: ['email', 'password', 'personal_info'],
    affected_count: 500000
  }
];

export const testEmails = [
  'john.doe@example.com',
  'jane.smith@test.org',
  'admin@secure.net',
  'user@demo.com',
  'nonexistent@nowhere.com'
];

export const expectedResults = {
  'john.doe@example.com': [
    {
      source: 'plaintext',
      email: 'john.doe@example.com',
      data: 'password123:johndoe:John Doe'
    },
    {
      source: 'shard',
      email: 'john.doe@example.com',
      data: 'hash1:data1'
    },
    {
      source: 'postgres',
      email: 'john.doe@example.com',
      breach_name: 'Example Corp Breach',
      breach_date: '2023-01-15T00:00:00.000Z',
      password_hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
      data_types: ['email', 'password', 'username'],
      affected_count: 1000000
    }
  ]
};
