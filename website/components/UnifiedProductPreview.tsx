import { BrowserPreview } from "./BrowserPreview";
import { PopupPanel } from "./PopupPanel";

export function UnifiedProductPreview() {
  return (
    <div className="unified-product-preview panel-frame" aria-label="Chrome browser with the Browser Tycoon extension open">
      <BrowserPreview embedded />
      <div className="popup-overlay">
        <PopupPanel embedded />
      </div>
    </div>
  );
}
