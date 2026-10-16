import * as Dialog from '@radix-ui/react-dialog';
export function Modal({ title, description, open, onOpenChange, children, className = '' }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/>
    <Dialog.Content className={`modal-card ${className}`}><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description>{children}</Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
