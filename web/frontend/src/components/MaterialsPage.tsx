import { IconLayers } from './icons';
import MaterialsPanel from './MaterialsPanel';

export default function MaterialsPage() {
  return (
    <div className="page-scroll breakdown-page">
      <div className="page-head">
        <div>
          <h1 className="page-title"><IconLayers size={21} /> 素材库</h1>
          <p className="page-subtitle">直接展示 Obsidian 素材库（vault）目录：每个账号下的素材与两份硬性避坑红线，写稿时自动带入。</p>
        </div>
      </div>

      <div className="breakdown-body">
        <MaterialsPanel />
      </div>
    </div>
  );
}
