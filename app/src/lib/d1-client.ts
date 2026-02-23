/**
 * D1Client - Wraps Cloudflare D1 with a Prisma-compatible query API.
 *
 * Covers every Prisma call used in the app (questions, attempts, bookmarks,
 * subjects, topics, settings) so that API routes can swap
 *   `const prisma = await getDb()`
 * for
 *   `const prisma = new D1Client(env.DB)`
 * without touching any call-sites.
 */

/* ------------------------------------------------------------------ */
/*  D1 type stubs (Cloudflare Workers runtime provides these)         */
/* ------------------------------------------------------------------ */

interface D1Database {
  prepare(sql: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
}
interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement
  first<T = unknown>(column?: string): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}
interface D1Result<T = unknown> {
  results: T[]
  success: boolean
}

/* ------------------------------------------------------------------ */
/*  Helper utilities                                                   */
/* ------------------------------------------------------------------ */

/** Convert a JS Date (or ISO string) to the TEXT format SQLite expects. */
function toSqlDate(d: Date | string): string {
  if (typeof d === 'string') return d
  return d.toISOString()
}

/** Build a "col IN (?,?,?)" fragment and its bind values from an array. */
function inFragment(col: string, ids: unknown[]): { sql: string; vals: unknown[] } {
  if (ids.length === 0) return { sql: '1=0', vals: [] }
  return { sql: `${col} IN (${ids.map(() => '?').join(',')})`, vals: ids }
}

/** Build a "col NOT IN (?,?,?)" fragment. */
function notInFragment(col: string, ids: unknown[]): { sql: string; vals: unknown[] } {
  if (ids.length === 0) return { sql: '1=1', vals: [] }
  return { sql: `${col} NOT IN (${ids.map(() => '?').join(',')})`, vals: ids }
}

/* ------------------------------------------------------------------ */
/*  D1Client                                                           */
/* ------------------------------------------------------------------ */

export class D1Client {
  constructor(private db: D1Database) {}

  /* ================================================================ */
  /*  question                                                         */
  /* ================================================================ */

  get question() {
    const db = this.db

    return {
      /* -------------------------------------------------------------- */
      /*  question.findMany                                              */
      /* -------------------------------------------------------------- */
      async findMany(opts: any = {}): Promise<any[]> {
        const where: string[] = []
        const vals: unknown[] = []
        const w = opts.where || {}

        // Simple equality filters
        if (w.subjectId !== undefined) { where.push('q.subjectId = ?'); vals.push(w.subjectId) }
        if (w.topicId !== undefined) { where.push('q.topicId = ?'); vals.push(w.topicId) }
        if (w.type !== undefined) { where.push('q.type = ?'); vals.push(w.type) }
        if (w.source !== undefined) { where.push('q.source = ?'); vals.push(w.source) }
        if (w.difficulty !== undefined) { where.push('q.difficulty = ?'); vals.push(w.difficulty) }

        // id: { in: [...] }
        if (w.id?.in) {
          const f = inFragment('q.id', w.id.in)
          where.push(f.sql); vals.push(...f.vals)
        }

        // id: { notIn: [...] }  (Prisma syntax used in questions route)
        if (w.id?.notIn) {
          const f = notInFragment('q.id', w.id.notIn)
          where.push(f.sql); vals.push(...f.vals)
        }

        // NOT: { id: { in: [...] } }
        if (w.NOT?.id?.in) {
          const f = notInFragment('q.id', w.NOT.id.in)
          where.push(f.sql); vals.push(...f.vals)
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

        // select: { id: true }  -> only IDs
        if (opts.select?.id) {
          const sql = `SELECT q.id FROM Question q ${whereClause} ORDER BY q.id ASC`
          const stmt = vals.length ? db.prepare(sql).bind(...vals) : db.prepare(sql)
          const res = await stmt.all<{ id: number }>()
          return res.results
        }

        // orderBy
        let orderClause = 'ORDER BY q.id ASC'
        if (opts.orderBy) {
          const ob = opts.orderBy
          if (ob.id === 'asc') orderClause = 'ORDER BY q.id ASC'
          else if (ob.id === 'desc') orderClause = 'ORDER BY q.id DESC'
        }

        // take / limit
        const limitClause = opts.take ? `LIMIT ${opts.take}` : ''

        const sql = `SELECT q.* FROM Question q ${whereClause} ${orderClause} ${limitClause}`
        const stmt = vals.length ? db.prepare(sql).bind(...vals) : db.prepare(sql)
        const res = await stmt.all<any>()
        let questions = res.results

        // include relations
        if (opts.include) {
          questions = await Promise.all(
            questions.map(async (q: any) => {
              if (opts.include.subject) {
                q.subject = await db.prepare('SELECT * FROM Subject WHERE id = ?').bind(q.subjectId).first()
              }
              if (opts.include.topic) {
                q.topic = q.topicId
                  ? await db.prepare('SELECT * FROM Topic WHERE id = ?').bind(q.topicId).first()
                  : null
              }
              if (opts.include.blankItems) {
                const biRes = await db.prepare('SELECT * FROM BlankItem WHERE questionId = ? ORDER BY position ASC').bind(q.id).all<any>()
                q.blankItems = biRes.results
              }
              return q
            })
          )
        }

        return questions
      },

      /* -------------------------------------------------------------- */
      /*  question.findUnique                                            */
      /* -------------------------------------------------------------- */
      async findUnique(opts: any): Promise<any | null> {
        const id = opts.where.id
        const q = await db.prepare('SELECT * FROM Question WHERE id = ?').bind(id).first<any>()
        if (!q) return null

        if (opts.include) {
          if (opts.include.subject) {
            q.subject = await db.prepare('SELECT * FROM Subject WHERE id = ?').bind(q.subjectId).first()
          }
          if (opts.include.topic) {
            q.topic = q.topicId
              ? await db.prepare('SELECT * FROM Topic WHERE id = ?').bind(q.topicId).first()
              : null
          }
          if (opts.include.attempts) {
            const take = opts.include.attempts.take || 100
            const atRes = await db.prepare(
              'SELECT * FROM Attempt WHERE questionId = ? ORDER BY createdAt DESC LIMIT ?'
            ).bind(id, take).all<any>()
            q.attempts = atRes.results
          }
          if (opts.include.bookmarks) {
            const bkRes = await db.prepare('SELECT * FROM Bookmark WHERE questionId = ?').bind(id).all<any>()
            q.bookmarks = bkRes.results
          }
          if (opts.include.blankItems) {
            const biRes = await db.prepare('SELECT * FROM BlankItem WHERE questionId = ? ORDER BY position ASC').bind(id).all<any>()
            q.blankItems = biRes.results
          }
        }

        return q
      },

      /* -------------------------------------------------------------- */
      /*  question.create                                                */
      /* -------------------------------------------------------------- */
      async create(opts: any): Promise<any> {
        const d = opts.data
        const sql = `INSERT INTO Question (content, modelAnswer, type, source, difficulty, subjectId, topicId, createdAt)
                     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        const stmt = db.prepare(sql).bind(
          d.content,
          d.modelAnswer,
          d.type || 'essay',
          d.source || 'formative',
          d.difficulty ?? 3,
          d.subjectId,
          d.topicId ?? null,
        )
        await stmt.run()
        // Return the newly created row
        const row = await db.prepare(
          'SELECT * FROM Question WHERE id = (SELECT MAX(id) FROM Question)'
        ).first<any>()
        return row
      },

      /* -------------------------------------------------------------- */
      /*  question.count                                                 */
      /* -------------------------------------------------------------- */
      async count(_opts?: any): Promise<number> {
        const row = await db.prepare('SELECT COUNT(*) as cnt FROM Question').first<{ cnt: number }>()
        return row?.cnt ?? 0
      },
    }
  }

  /* ================================================================ */
  /*  attempt                                                          */
  /* ================================================================ */

  get attempt() {
    const db = this.db

    return {
      /* -------------------------------------------------------------- */
      /*  attempt.findMany                                               */
      /* -------------------------------------------------------------- */
      async findMany(opts: any = {}): Promise<any[]> {
        const where: string[] = []
        const vals: unknown[] = []
        const w = opts.where || {}

        // score: { lte: N }
        if (w.score?.lte !== undefined) { where.push('a.score <= ?'); vals.push(w.score.lte) }

        // createdAt range
        if (w.createdAt?.gte) { where.push("a.createdAt >= ?"); vals.push(toSqlDate(w.createdAt.gte)) }
        if (w.createdAt?.lte) { where.push("a.createdAt <= ?"); vals.push(toSqlDate(w.createdAt.lte)) }

        // Nested relation filter: question: { subjectId, topicId }
        let joinQuestion = false
        if (w.question) {
          joinQuestion = true
          if (w.question.subjectId !== undefined) {
            where.push('qr.subjectId = ?'); vals.push(w.question.subjectId)
          }
          if (w.question.topicId !== undefined) {
            where.push('qr.topicId = ?'); vals.push(w.question.topicId)
          }
        }

        const fromClause = joinQuestion
          ? 'FROM Attempt a JOIN Question qr ON a.questionId = qr.id'
          : 'FROM Attempt a'
        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

        // distinct
        const selectDistinct = opts.distinct?.includes('questionId') ? 'DISTINCT' : ''

        // select: { questionId: true }
        if (opts.select?.questionId) {
          const sql = `SELECT ${selectDistinct} a.questionId ${fromClause} ${whereClause}`
          const stmt = vals.length ? db.prepare(sql).bind(...vals) : db.prepare(sql)
          const res = await stmt.all<{ questionId: number }>()
          return res.results
        }

        // orderBy
        let orderClause = ''
        if (opts.orderBy) {
          const ob = opts.orderBy
          if (ob.createdAt === 'desc') orderClause = 'ORDER BY a.createdAt DESC'
          else if (ob.createdAt === 'asc') orderClause = 'ORDER BY a.createdAt ASC'
        }

        const limitClause = opts.take ? `LIMIT ${opts.take}` : ''

        const sql = `SELECT ${selectDistinct} a.* ${fromClause} ${whereClause} ${orderClause} ${limitClause}`
        const stmt = vals.length ? db.prepare(sql).bind(...vals) : db.prepare(sql)
        const res = await stmt.all<any>()
        let attempts = res.results

        // include relations
        if (opts.include?.question) {
          const inc = opts.include.question.include || {}
          attempts = await Promise.all(
            attempts.map(async (a: any) => {
              const q = await db.prepare('SELECT * FROM Question WHERE id = ?').bind(a.questionId).first<any>()
              if (q && inc.subject) {
                q.subject = await db.prepare('SELECT * FROM Subject WHERE id = ?').bind(q.subjectId).first()
              }
              if (q && inc.topic) {
                q.topic = q.topicId
                  ? await db.prepare('SELECT * FROM Topic WHERE id = ?').bind(q.topicId).first()
                  : null
              }
              a.question = q
              return a
            })
          )
        }

        return attempts
      },

      /* -------------------------------------------------------------- */
      /*  attempt.create                                                 */
      /* -------------------------------------------------------------- */
      async create(opts: any): Promise<any> {
        const d = opts.data
        await db.prepare(
          "INSERT INTO Attempt (questionId, userAnswer, score, createdAt) VALUES (?, ?, ?, datetime('now'))"
        ).bind(d.questionId, d.userAnswer, d.score).run()

        const row = await db.prepare(
          'SELECT * FROM Attempt WHERE id = (SELECT MAX(id) FROM Attempt)'
        ).first<any>()
        return row
      },

      /* -------------------------------------------------------------- */
      /*  attempt.count                                                  */
      /* -------------------------------------------------------------- */
      async count(opts: any = {}): Promise<number> {
        const where: string[] = []
        const vals: unknown[] = []
        const w = opts.where || {}

        if (w.createdAt?.gte) { where.push("createdAt >= ?"); vals.push(toSqlDate(w.createdAt.gte)) }
        if (w.createdAt?.lte) { where.push("createdAt <= ?"); vals.push(toSqlDate(w.createdAt.lte)) }

        // Nested: question: { subjectId }
        if (w.question) {
          const sub: string[] = []
          if (w.question.subjectId !== undefined) sub.push(`subjectId = ${Number(w.question.subjectId)}`)
          if (w.question.topicId !== undefined) sub.push(`topicId = ${Number(w.question.topicId)}`)
          if (sub.length) {
            where.push(`questionId IN (SELECT id FROM Question WHERE ${sub.join(' AND ')})`)
          }
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
        const sql = `SELECT COUNT(*) as cnt FROM Attempt ${whereClause}`
        const stmt = vals.length ? db.prepare(sql).bind(...vals) : db.prepare(sql)
        const row = await stmt.first<{ cnt: number }>()
        return row?.cnt ?? 0
      },

      /* -------------------------------------------------------------- */
      /*  attempt.aggregate                                              */
      /* -------------------------------------------------------------- */
      async aggregate(opts: any): Promise<{ _avg: { score: number | null } }> {
        const where: string[] = []
        const vals: unknown[] = []
        const w = opts.where || {}

        if (w.question) {
          if (w.question.subjectId !== undefined) {
            where.push(`questionId IN (SELECT id FROM Question WHERE subjectId = ?)`)
            vals.push(w.question.subjectId)
          }
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
        const sql = `SELECT AVG(score) as avgScore FROM Attempt ${whereClause}`
        const stmt = vals.length ? db.prepare(sql).bind(...vals) : db.prepare(sql)
        const row = await stmt.first<{ avgScore: number | null }>()
        return { _avg: { score: row?.avgScore ?? null } }
      },
    }
  }

  /* ================================================================ */
  /*  bookmark                                                         */
  /* ================================================================ */

  get bookmark() {
    const db = this.db

    return {
      /* -------------------------------------------------------------- */
      /*  bookmark.findMany                                              */
      /* -------------------------------------------------------------- */
      async findMany(opts: any = {}): Promise<any[]> {
        // select: { questionId: true }  (used in questions route for bookmarked mode)
        if (opts.select?.questionId) {
          const res = await db.prepare('SELECT questionId FROM Bookmark').all<{ questionId: number }>()
          return res.results
        }

        // orderBy
        let orderClause = ''
        if (opts.orderBy) {
          if (opts.orderBy.createdAt === 'desc') orderClause = 'ORDER BY createdAt DESC'
          else if (opts.orderBy.createdAt === 'asc') orderClause = 'ORDER BY createdAt ASC'
        }

        const sql = `SELECT * FROM Bookmark ${orderClause}`
        const res = await db.prepare(sql).all<any>()
        let bookmarks = res.results

        // include question with nested subject/topic
        if (opts.include?.question) {
          const inc = opts.include.question.include || {}
          bookmarks = await Promise.all(
            bookmarks.map(async (b: any) => {
              const q = await db.prepare('SELECT * FROM Question WHERE id = ?').bind(b.questionId).first<any>()
              if (q && inc.subject) {
                q.subject = await db.prepare('SELECT * FROM Subject WHERE id = ?').bind(q.subjectId).first()
              }
              if (q && inc.topic) {
                q.topic = q.topicId
                  ? await db.prepare('SELECT * FROM Topic WHERE id = ?').bind(q.topicId).first()
                  : null
              }
              b.question = q
              return b
            })
          )
        }

        return bookmarks
      },

      /* -------------------------------------------------------------- */
      /*  bookmark.findFirst                                             */
      /* -------------------------------------------------------------- */
      async findFirst(opts: any): Promise<any | null> {
        const w = opts.where || {}
        const where: string[] = []
        const vals: unknown[] = []

        if (w.questionId !== undefined) {
          where.push('questionId = ?'); vals.push(w.questionId)
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
        const sql = `SELECT * FROM Bookmark ${whereClause} LIMIT 1`
        const stmt = vals.length ? db.prepare(sql).bind(...vals) : db.prepare(sql)
        return stmt.first<any>()
      },

      /* -------------------------------------------------------------- */
      /*  bookmark.create                                                */
      /* -------------------------------------------------------------- */
      async create(opts: any): Promise<any> {
        const d = opts.data
        await db.prepare(
          "INSERT INTO Bookmark (questionId, note, createdAt) VALUES (?, ?, datetime('now'))"
        ).bind(d.questionId, d.note ?? null).run()

        const row = await db.prepare(
          'SELECT * FROM Bookmark WHERE id = (SELECT MAX(id) FROM Bookmark)'
        ).first<any>()
        return row
      },

      /* -------------------------------------------------------------- */
      /*  bookmark.delete                                                */
      /* -------------------------------------------------------------- */
      async delete(opts: any): Promise<any> {
        const id = opts.where.id
        const existing = await db.prepare('SELECT * FROM Bookmark WHERE id = ?').bind(id).first<any>()
        await db.prepare('DELETE FROM Bookmark WHERE id = ?').bind(id).run()
        return existing
      },

      /* -------------------------------------------------------------- */
      /*  bookmark.count                                                 */
      /* -------------------------------------------------------------- */
      async count(): Promise<number> {
        const row = await db.prepare('SELECT COUNT(*) as cnt FROM Bookmark').first<{ cnt: number }>()
        return row?.cnt ?? 0
      },
    }
  }

  /* ================================================================ */
  /*  subject                                                          */
  /* ================================================================ */

  get subject() {
    const db = this.db

    return {
      /* -------------------------------------------------------------- */
      /*  subject.findMany                                               */
      /* -------------------------------------------------------------- */
      async findMany(opts: any = {}): Promise<any[]> {
        // orderBy - can be object or array of objects
        let orderClause = 'ORDER BY id ASC'
        if (opts.orderBy) {
          const parts: string[] = []
          const obs = Array.isArray(opts.orderBy) ? opts.orderBy : [opts.orderBy]
          for (const ob of obs) {
            if (ob.category) parts.push(`category ${ob.category.toUpperCase()}`)
            if (ob.name) parts.push(`name ${ob.name.toUpperCase()}`)
          }
          if (parts.length) orderClause = `ORDER BY ${parts.join(', ')}`
        }

        const sql = `SELECT * FROM Subject ${orderClause}`
        const res = await db.prepare(sql).all<any>()
        let subjects = res.results

        // include: { _count: { select: { questions: true } } }
        if (opts.include?._count?.select?.questions) {
          subjects = await Promise.all(
            subjects.map(async (s: any) => {
              const row = await db.prepare(
                'SELECT COUNT(*) as cnt FROM Question WHERE subjectId = ?'
              ).bind(s.id).first<{ cnt: number }>()
              s._count = { questions: row?.cnt ?? 0 }
              return s
            })
          )
        }

        return subjects
      },

      /* -------------------------------------------------------------- */
      /*  subject.findUnique                                             */
      /* -------------------------------------------------------------- */
      async findUnique(opts: any): Promise<any | null> {
        const id = opts.where.id
        const s = await db.prepare('SELECT * FROM Subject WHERE id = ?').bind(id).first<any>()
        if (!s) return null

        if (opts.include) {
          // _count.questions
          if (opts.include._count?.select?.questions) {
            const row = await db.prepare(
              'SELECT COUNT(*) as cnt FROM Question WHERE subjectId = ?'
            ).bind(id).first<{ cnt: number }>()
            s._count = { questions: row?.cnt ?? 0 }
          }

          // topics with their own _count and orderBy
          if (opts.include.topics) {
            let topicOrder = 'ORDER BY id ASC'
            if (opts.include.topics.orderBy?.name) {
              topicOrder = `ORDER BY name ${opts.include.topics.orderBy.name.toUpperCase()}`
            }
            const topicsRes = await db.prepare(
              `SELECT * FROM Topic WHERE subjectId = ? ${topicOrder}`
            ).bind(id).all<any>()
            let topics = topicsRes.results

            // Each topic may need _count
            if (opts.include.topics.include?._count?.select?.questions) {
              topics = await Promise.all(
                topics.map(async (t: any) => {
                  const row = await db.prepare(
                    'SELECT COUNT(*) as cnt FROM Question WHERE topicId = ?'
                  ).bind(t.id).first<{ cnt: number }>()
                  t._count = { questions: row?.cnt ?? 0 }
                  return t
                })
              )
            }

            s.topics = topics
          }
        }

        return s
      },
    }
  }

  /* ================================================================ */
  /*  topic                                                            */
  /* ================================================================ */

  get topic() {
    const db = this.db

    return {
      async findUnique(opts: any): Promise<any | null> {
        const id = opts.where.id
        return db.prepare('SELECT * FROM Topic WHERE id = ?').bind(id).first<any>()
      },
    }
  }

  /* ================================================================ */
  /*  setting                                                          */
  /* ================================================================ */

  get setting() {
    const db = this.db

    return {
      /* -------------------------------------------------------------- */
      /*  setting.findMany                                               */
      /* -------------------------------------------------------------- */
      async findMany(): Promise<any[]> {
        const res = await db.prepare('SELECT * FROM Setting').all<any>()
        return res.results
      },

      /* -------------------------------------------------------------- */
      /*  setting.findUnique                                             */
      /* -------------------------------------------------------------- */
      async findUnique(opts: any): Promise<any | null> {
        const key = opts.where.key
        return db.prepare('SELECT * FROM Setting WHERE key = ?').bind(key).first<any>()
      },

      /* -------------------------------------------------------------- */
      /*  setting.upsert                                                 */
      /* -------------------------------------------------------------- */
      async upsert(opts: any): Promise<any> {
        const { where, update, create } = opts
        const sql = `INSERT INTO Setting (key, value) VALUES (?, ?)
                     ON CONFLICT(key) DO UPDATE SET value = ?`
        await db.prepare(sql).bind(
          create.key,
          create.value,
          update.value,
        ).run()

        return db.prepare('SELECT * FROM Setting WHERE key = ?').bind(where.key).first<any>()
      },
    }
  }

  /* ================================================================ */
  /*  user                                                             */
  /* ================================================================ */

  get user() {
    const db = this.db

    return {
      async findUnique(opts: any): Promise<any | null> {
        const w = opts.where
        if (w.username) {
          return db.prepare('SELECT * FROM User WHERE username = ?').bind(w.username).first<any>()
        }
        if (w.id) {
          return db.prepare('SELECT * FROM User WHERE id = ?').bind(w.id).first<any>()
        }
        return null
      },

      async create(opts: any): Promise<any> {
        const d = opts.data
        await db.prepare(
          "INSERT INTO User (username, password, name, createdAt) VALUES (?, ?, ?, datetime('now'))"
        ).bind(d.username, d.password, d.name ?? null).run()

        const row = await db.prepare(
          'SELECT * FROM User WHERE id = (SELECT MAX(id) FROM User)'
        ).first<any>()
        return row
      },
    }
  }
}
