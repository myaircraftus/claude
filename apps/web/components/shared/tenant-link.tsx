"use client";

import NextLink from "next/link";
import { useMemo } from "react";
import type { AnchorHTMLAttributes, PropsWithChildren } from "react";
import type { LinkProps } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  getTenantSlugFromPathname,
  isDemoPathname,
  withRoutePrefix,
} from "@/lib/auth/tenant-routing";

type TenantLinkProps = PropsWithChildren<
  LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>
>;
type RouterInstance = ReturnType<typeof useRouter>;
type NavigateOptions = Parameters<RouterInstance["push"]>[1];

function useRouteContext() {
  const pathname = usePathname();
  const demo = isDemoPathname(pathname);
  const tenantSlug = demo ? null : getTenantSlugFromPathname(pathname);
  return { tenantSlug, demo };
}

export function useTenantHref<T extends LinkProps["href"]>(href: T): T {
  const ctx = useRouteContext();
  return withRoutePrefix(href, ctx);
}

export function useTenantRouter() {
  const router = useRouter();
  const { tenantSlug, demo } = useRouteContext();

  // Memoize so the returned object has a stable identity across renders.
  // Why: callers put this in useEffect dep arrays. Returning a fresh object
  // each render caused an infinite loop where the effect re-fetched, set
  // state, re-rendered, and saw a "new" router again. The tenant slug and
  // demo flag are the only inputs that actually change the wrapping.
  return useMemo(() => {
    const ctx = { tenantSlug, demo };
    return {
      ...router,
      push(href: Parameters<RouterInstance["push"]>[0], options?: NavigateOptions) {
        return router.push(withRoutePrefix(href, ctx), options);
      },
      replace(href: Parameters<RouterInstance["replace"]>[0], options?: NavigateOptions) {
        return router.replace(withRoutePrefix(href, ctx), options);
      },
      prefetch(href: Parameters<RouterInstance["prefetch"]>[0], options?: Parameters<RouterInstance["prefetch"]>[1]) {
        return router.prefetch(withRoutePrefix(href, ctx), options);
      },
    };
  }, [router, tenantSlug, demo]);
}

export default function TenantLink({ href, ...props }: TenantLinkProps) {
  const tenantHref = useTenantHref(href);
  return <NextLink href={tenantHref} {...props} />;
}
