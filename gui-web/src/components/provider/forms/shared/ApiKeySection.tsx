import { AuthInput, type AuthInputProps } from './AuthInput'

export interface ApiKeySectionProps extends AuthInputProps {
  apiKeyUrl?: string
}

export function ApiKeySection({ apiKeyUrl, ...props }: ApiKeySectionProps) {
  return <div>
    <AuthInput {...props} />
    {apiKeyUrl && <a href={apiKeyUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-blue-500 hover:underline">获取 API Key</a>}
  </div>
}
