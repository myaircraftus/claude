"use client";

import NextLink from "next/link";
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
  const ctx = useRouteContext();

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
}

export default function TenantLink({ href, ...props }: TenantLinkProps) {
  const tenantHref = useTenantHref(href);
  return <NextLink href={tenantHref} {...props} />;
}
