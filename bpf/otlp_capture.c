// SPDX-License-Identifier: GPL-2.0
#include <linux/bpf.h>
#include <linux/pkt_cls.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/tcp.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

#define OTLP_GRPC_PORT 4317
#define OTLP_HTTP_PORT 4318
#define MAX_PAYLOAD_SIZE 4096

struct event {
    __u32 src_ip;
    __u32 dst_ip;
    __u16 src_port;
    __u16 dst_port;
    __u8  direction;
    __u8  proto;
    __u8  pad[2];
    __u32 payload_len;
    __u8  payload[MAX_PAYLOAD_SIZE];
};

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24);
} events SEC(".maps");

static __always_inline int handle_packet(struct __sk_buff *skb, __u8 direction) {
    void *data = (void *)(long)skb->data;
    void *data_end = (void *)(long)skb->data_end;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return TC_ACT_OK;

    if (eth->h_proto != bpf_htons(ETH_P_IP))
        return TC_ACT_OK;

    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end)
        return TC_ACT_OK;

    if (ip->protocol != IPPROTO_TCP)
        return TC_ACT_OK;

    __u32 ip_hdr_len = ip->ihl * 4;
    struct tcphdr *tcp = (void *)ip + ip_hdr_len;
    if ((void *)(tcp + 1) > data_end)
        return TC_ACT_OK;

    __u16 sport = bpf_ntohs(tcp->source);
    __u16 dport = bpf_ntohs(tcp->dest);

    if (sport != OTLP_GRPC_PORT && sport != OTLP_HTTP_PORT &&
        dport != OTLP_GRPC_PORT && dport != OTLP_HTTP_PORT)
        return TC_ACT_OK;

    __u8 proto = (sport == OTLP_GRPC_PORT || dport == OTLP_GRPC_PORT) ? 0 : 1;

    __u32 tcp_hdr_len = tcp->doff * 4;
    void *payload = (void *)tcp + tcp_hdr_len;
    if (payload >= data_end)
        return TC_ACT_OK;

    __u32 payload_len = (__u32)(data_end - payload);
    if (payload_len == 0)
        return TC_ACT_OK;

    struct event *e = bpf_ringbuf_reserve(&events, sizeof(struct event), 0);
    if (!e)
        return TC_ACT_OK;

    e->src_ip = ip->saddr;
    e->dst_ip = ip->daddr;
    e->src_port = sport;
    e->dst_port = dport;
    e->direction = direction;
    e->proto = proto;
    e->pad[0] = 0;
    e->pad[1] = 0;

    if (payload_len > MAX_PAYLOAD_SIZE)
        payload_len = MAX_PAYLOAD_SIZE;

    e->payload_len = payload_len;

    __u32 offset = (__u32)(payload - data);
    long ret = bpf_skb_load_bytes(skb, offset, e->payload, payload_len);
    if (ret < 0) {
        bpf_ringbuf_discard(e, 0);
        return TC_ACT_OK;
    }

    bpf_ringbuf_submit(e, 0);
    return TC_ACT_OK;
}

SEC("tc")
int tc_ingress(struct __sk_buff *skb) {
    return handle_packet(skb, 0);
}

SEC("tc")
int tc_egress(struct __sk_buff *skb) {
    return handle_packet(skb, 1);
}

char _license[] SEC("license") = "GPL";
