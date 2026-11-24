import fs from 'fs'
import os from 'os'
import path from 'path'

export function homeDir(): string {
  return path.join(os.homedir(), '.tokendeck')
}

export class Log {
  readonly file: string

  constructor() {
    const dir = path.join(homeDir(), 'log')
    fs.mkdirSync(dir, { recursive: true })
    this.file = path.join(dir, 'tokendeck.log')
    this.rotateIfNeeded()
  }

  private rotateIfNeeded(): void {
    try {
      if (fs.existsSync(this.file) && fs.statSync(this.file).size > 5 * 1024 * 1024) {
        fs.renameSync(this.file, `${this.file}.1`)
      }
    } catch {
      /* a rotation failure still leaves the current file usable */
    }
  }

  write(line: string): void {
    this.rotateIfNeeded()
    const text = `${new Date().toISOString()} ${line}\n`
    fs.appendFileSync(this.file, text)
  }

  tail(max = 8000): string {
    let fd: number | null = null
    try {
      fd = fs.openSync(this.file, 'r')
      const size = fs.fstatSync(fd).size
      if (size <= 0) return ''
      const readLen = Math.min(size, max)
      const buf = Buffer.allocUnsafe(readLen)
      const bytesRead = fs.readSync(fd, buf, 0, readLen, size - readLen)
      return buf.subarray(0, bytesRead).toString('utf8')
    } catch {
      return ''
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd)
        } catch {
          /* ignore */
        }
      }
    }
  }
}
