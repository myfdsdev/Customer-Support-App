import { useCallback, useState } from 'react';
import { portalService, toMessage } from '../../services/portalApi';
import { useToast } from '../../context/ToastContext';

/**
 * "Open App" behaviour, shared by every card and the product page.
 *
 * The launch URL is never trusted from the client: this always asks the
 * server, which re-verifies the entitlement and returns a (possibly signed)
 * URL. A popup blocker is handled gracefully — if window.open is blocked we
 * navigate the current tab instead of silently doing nothing.
 */
export function useLaunch() {
  const [launchingId, setLaunchingId] = useState(null);
  const toast = useToast();

  const launch = useCallback(
    async (product) => {
      if (!product?._id) return;
      setLaunchingId(product._id);
      // Open the tab synchronously so it isn't treated as a popup, then point
      // it at the resolved URL once the server responds.
      const tab = window.open('', '_blank');
      try {
        const { launchUrl } = await portalService.launch(product._id);
        if (!launchUrl) throw new Error('No launch URL configured');
        if (tab) tab.location = launchUrl;
        else window.location.href = launchUrl;
      } catch (err) {
        if (tab) tab.close();
        toast?.error?.(toMessage(err));
      } finally {
        setLaunchingId(null);
      }
    },
    [toast]
  );

  return { launch, launchingId };
}
