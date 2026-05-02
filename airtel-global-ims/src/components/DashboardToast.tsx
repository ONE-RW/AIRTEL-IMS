type DashboardToastProps = {
  message: string;
  type: "success" | "error";
  onClose: () => void;
};

function DashboardToast({ message, type, onClose }: DashboardToastProps) {
  return (
    <div className={`dashboard-toast dashboard-toast-${type}`} role="status" aria-live="polite">
      <div className="dashboard-toast-content">
        <strong>{type === "success" ? "Success" : "Attention"}</strong>
        <p>{message}</p>
      </div>
      <button className="dashboard-toast-close" type="button" onClick={onClose} aria-label="Close notification">
        x
      </button>
    </div>
  );
}

export default DashboardToast;
