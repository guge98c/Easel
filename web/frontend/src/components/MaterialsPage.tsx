import { IconLayers } from './icons';
import MaterialsPanel from './MaterialsPanel';

export default function MaterialsPage() {
  return (
    <div className="page-scroll breakdown-page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><IconLayers size={21} /> 素材库</h1>
          <p className="page-subtitle">拆解自动沉淀的标题与金句/切片，按公式与类型归类，可一键复制复用。</p>
        </div>
      </div>

      <div className="breakdown-body">
        <MaterialsPanel />
      </div>
    </div>
  );
}
