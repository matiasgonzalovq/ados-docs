const KEY = 'ados.activeIssuer'

export function getActiveIssuer(): string | null {
  return localStorage.getItem(KEY)
}

export function setDefaultActiveIssuer(id: string | null): void {
  if (id === null) {
    localStorage.removeItem(KEY)
  } else {
    localStorage.setItem(KEY, id)
  }
}
