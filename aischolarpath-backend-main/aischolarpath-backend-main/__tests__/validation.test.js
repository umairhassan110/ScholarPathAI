const { validate, rateLimit, sanitizeInput, isEmail, isCNIC } = require('../validation');

// ═══════════════════════════════════════════════════════════════
// isEmail
// ═══════════════════════════════════════════════════════════════
describe('isEmail', () => {
  test('valid emails', () => {
    expect(isEmail('user@example.com')).toBe(true);
    expect(isEmail('test.user@domain.co')).toBe(true);
    expect(isEmail('name+tag@gmail.com')).toBe(true);
  });

  test('invalid emails', () => {
    expect(isEmail('')).toBe(false);
    expect(isEmail('notanemail')).toBe(false);
    expect(isEmail('@domain.com')).toBe(false);
    expect(isEmail('user@')).toBe(false);
    expect(isEmail('user @domain.com')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// isCNIC
// ═══════════════════════════════════════════════════════════════
describe('isCNIC', () => {
  test('valid CNIC formats', () => {
    expect(isCNIC('12345-1234567-1')).toBe(true);
    expect(isCNIC('1234512345671')).toBe(true);
  });

  test('invalid CNIC formats', () => {
    expect(isCNIC('')).toBe(false);
    expect(isCNIC('1234')).toBe(false);
    expect(isCNIC('abcdefghijklmnopq')).toBe(false);
    expect(isCNIC('12345-123456-12')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// validate middleware
// ═══════════════════════════════════════════════════════════════
describe('validate middleware', () => {
  let mockReq, mockRes, nextFn;

  beforeEach(() => {
    mockReq = { body: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFn = jest.fn();
  });

  test('passes when all required fields present', () => {
    mockReq.body = { email: 'test@test.com', password: 'secret123' };
    const middleware = validate({
      email: { required: true, type: 'email' },
      password: { required: true, minLength: 6 },
    });
    middleware(mockReq, mockRes, nextFn);
    expect(nextFn).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  test('rejects when required field missing', () => {
    mockReq.body = { email: 'test@test.com' };
    const middleware = validate({
      email: { required: true, type: 'email' },
      password: { required: true },
    });
    middleware(mockReq, mockRes, nextFn);
    expect(nextFn).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('rejects invalid email', () => {
    mockReq.body = { email: 'notanemail' };
    const middleware = validate({ email: { required: true, type: 'email' } });
    middleware(mockReq, mockRes, nextFn);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('rejects password too short', () => {
    mockReq.body = { password: 'abc' };
    const middleware = validate({ password: { required: true, minLength: 6 } });
    middleware(mockReq, mockRes, nextFn);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('rejects invalid CNIC', () => {
    mockReq.body = { cnic: '12345' };
    const middleware = validate({ cnic: { required: true, type: 'cnic' } });
    middleware(mockReq, mockRes, nextFn);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('rejects number out of range', () => {
    mockReq.body = { cgpa: 5.5 };
    const middleware = validate({ cgpa: { min: 0, max: 4 } });
    middleware(mockReq, mockRes, nextFn);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('rejects invalid enum value', () => {
    mockReq.body = { status: 'invalid_status' };
    const middleware = validate({ status: { enum: ['active', 'inactive'] } });
    middleware(mockReq, mockRes, nextFn);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('skips optional fields when empty', () => {
    mockReq.body = { email: 'test@test.com' };
    const middleware = validate({
      email: { required: true, type: 'email' },
      phone: { minLength: 10 },
    });
    middleware(mockReq, mockRes, nextFn);
    expect(nextFn).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// sanitizeInput
// ═══════════════════════════════════════════════════════════════
describe('sanitizeInput', () => {
  test('strips HTML tags from string values', () => {
    const req = { body: { name: '<script>alert("xss")</script>John', age: 25 } };
    const res = {};
    const next = jest.fn();
    sanitizeInput(req, res, next);
    expect(req.body.name).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;John');
    expect(req.body.age).toBe(25); // numbers unchanged
    expect(next).toHaveBeenCalled();
  });

  test('trims whitespace from strings', () => {
    const req = { body: { name: '  John Doe  ' } };
    sanitizeInput(req, {}, jest.fn());
    expect(req.body.name).toBe('John Doe');
  });

  test('handles missing body gracefully', () => {
    const req = {};
    sanitizeInput(req, {}, jest.fn());
    // Should not throw
  });
});

// ═══════════════════════════════════════════════════════════════
// rateLimit
// ═══════════════════════════════════════════════════════════════
describe('rateLimit', () => {
  test('allows requests under limit', () => {
    const req = { ip: '127.0.0.1' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    const limiter = rateLimit({ windowMs: 60000, max: 3 });
    limiter(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('blocks requests over limit', () => {
    const limiter = rateLimit({ windowMs: 60000, max: 2 });
    const req = { ip: '192.168.1.100' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    limiter(req, res, next); // 1
    limiter(req, res, next); // 2
    limiter(req, res, next); // 3 — blocked
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
