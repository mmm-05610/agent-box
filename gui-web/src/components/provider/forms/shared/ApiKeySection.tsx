import { AuthInput, type AuthInputProps } from './AuthInput'
import { useTranslation } from 'react-i18next'

export interface ApiKeySectionProps extends AuthInputProps {
  apiKeyUrl?: string
}

export function ApiKeySection({ apiKeyUrl, ...props }: ApiKeySectionProps) {
  const { t } = useTranslation()
  return <div>
    <AuthInput {...props} />
    {apiKeyUrl && <a href={apiKeyUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-blue-500 hover:underline">{t('providerForm.getApiKey')}</a>}
  </div>
}
