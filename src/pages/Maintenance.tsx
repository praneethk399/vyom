import { Panel } from '../components/Panel';
import { Reveal } from '../components/Reveal';
import { ComponentRulList } from '../features/maintenance/ComponentRulList';
import { MissionMatrix } from '../features/maintenance/MissionMatrix';
import { MissionLog } from '../features/maintenance/MissionLog';

export function Maintenance() {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel
          title="COMPONENT LIFE · RUL vs TBO"
          className="xl:col-span-7"
          right={<span className="num text-[8px] text-muted">LIFING MODELS · FAULT-AWARE</span>}
        >
          <ComponentRulList />
        </Panel>

        <Reveal className="xl:col-span-5">
          <Panel title="MISSION RELIABILITY MATRIX" className="h-full" bodyClassName="p-2.5">
            <MissionMatrix />
          </Panel>
        </Reveal>
      </div>

      <Panel title="MISSION / FAULT HISTORY" right={<span className="num text-[8px] text-muted">SWIPER · FROM FLIGHTDATASET LIBRARY + SYSTEM LOG</span>}>
        <MissionLog />
      </Panel>
    </div>
  );
}