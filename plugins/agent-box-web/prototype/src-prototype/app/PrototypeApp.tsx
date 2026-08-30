import { Shell } from '../components/Chrome'
import { useRoute } from './router'
import { Works, WorkOverview } from '../features/WorkPages'
import { ExecutionOverview, Activity, Outputs } from '../features/ExecutionPages'
import { BindingComposer } from '../features/BindingComposer'
import { Evidence, Integrations, Settings } from '../features/EvidenceAndUtility'
import { Harnesses, HarnessDetail, ProfileList, ProfileStudio, ProfileEdit, Resources, ResourceDetail, CcSwitchImport } from '../features/StudioPages'
export function PrototypeApp() { const route=useRoute(); let content: JSX.Element
  if(route==='/works') content=<Works/>; else if(route.startsWith('/works/')) content=<WorkOverview/>
  else if(route.startsWith('/executions/')) { if(route.endsWith('/binding')) content=<BindingComposer/>; else if(route.endsWith('/activity')) content=<Activity/>; else if(route.endsWith('/outputs')) content=<Outputs/>; else if(route.endsWith('/evidence')) content=<Evidence/>; else content=<ExecutionOverview/> }
  else if(route==='/harnesses') content=<Harnesses/>; else if(route==='/harnesses/codex') content=<HarnessDetail/>; else if(route==='/harnesses/codex/profiles') content=<ProfileList/>; else if(route.startsWith('/profiles/')) content=route.endsWith('/edit')?<ProfileEdit/>:<ProfileStudio/>
  else if(route==='/integrations') content=<Integrations/>; else if(route==='/integrations/plugins') content=<Integrations/>; else if(route==='/integrations/resources') content=<Resources/>; else if(route.startsWith('/integrations/resources/')) content=<ResourceDetail/>; else if(route==='/integrations/cc-switch') content=<CcSwitchImport/>; else if(route==='/settings') content=<Settings/>; else content=<Works/>
  return <Shell><div data-route-identity={route}>{content}</div></Shell> }
