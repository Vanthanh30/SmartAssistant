import * as Dialog from '@radix-ui/react-dialog';
export function Modal({ title, description, open, onOpenChange, children }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/>
    <Dialog.Content className="modal-card"><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description>{children}</Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
