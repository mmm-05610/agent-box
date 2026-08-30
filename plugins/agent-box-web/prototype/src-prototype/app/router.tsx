import { useEffect, useState, type AnchorHTMLAttributes } from 'react'
export const useRoute = () => { const [route, setRoute] = useState(location.hash.slice(1) || '/works'); useEffect(() => { const listener = () => setRoute(location.hash.slice(1) || '/works'); addEventListener('hashchange', listener); return () => removeEventListener('hashchange', listener) }, []); return route }
export function go(to: string) { location.hash = to }
export function Link({ to, ...props }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) { return <a href={`#${to}`} {...props} /> }
