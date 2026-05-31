package k8s

import (
	"context"
	"fmt"
	"os"
	"sync"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/cloudmon/netwatch/internal/model"
)

type ipMeta struct {
	Name      string
	Namespace string
	Port      int32
	Labels    map[string]string
}

type Discoverer struct {
	clientset  *kubernetes.Clientset
	ipMap      map[string]ipMeta
	mu         sync.RWMutex
	done       chan struct{}
	nodeName   string
}

func NewDiscoverer(kubeconfig string) (*Discoverer, error) {
	config, err := buildConfig(kubeconfig)
	if err != nil {
		return nil, fmt.Errorf("building kube config: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("creating k8s client: %w", err)
	}

	nodeName := os.Getenv("NODE_NAME")

	return &Discoverer{
		clientset: clientset,
		ipMap:     make(map[string]ipMeta),
		done:      make(chan struct{}),
		nodeName:  nodeName,
	}, nil
}

func buildConfig(kubeconfig string) (*rest.Config, error) {
	if kubeconfig != "" {
		return clientcmd.BuildConfigFromFlags("", kubeconfig)
	}
	return rest.InClusterConfig()
}

func (d *Discoverer) Start(ctx context.Context) {
	go d.watchPods(ctx)
	go d.watchServices(ctx)
	go d.watchEndpoints(ctx)
}

func (d *Discoverer) Stop() {
	close(d.done)
}

func (d *Discoverer) LookupByIP(ip string) (model.ServiceEndpoint, bool) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	meta, ok := d.ipMap[ip]
	if !ok {
		return model.ServiceEndpoint{}, false
	}

	return model.ServiceEndpoint{
		Name:      meta.Name,
		Namespace: meta.Namespace,
		IP:        ip,
		Port:      meta.Port,
		Labels:    meta.Labels,
	}, true
}

func (d *Discoverer) AllServices() []model.ServiceEndpoint {
	d.mu.RLock()
	defer d.mu.RUnlock()

	services := make([]model.ServiceEndpoint, 0, len(d.ipMap))
	for ip, meta := range d.ipMap {
		services = append(services, model.ServiceEndpoint{
			Name:      meta.Name,
			Namespace: meta.Namespace,
			IP:        ip,
			Port:      meta.Port,
			Labels:    meta.Labels,
		})
	}
	return services
}

func (d *Discoverer) watchPods(ctx context.Context) {
	for {
		select {
		case <-d.done:
			return
		default:
		}

		opts := metav1.ListOptions{FieldSelector: ""}
		if d.nodeName != "" {
			opts.FieldSelector = fmt.Sprintf("spec.nodeName=%s", d.nodeName)
		}

		w, err := d.clientset.CoreV1().Pods("").Watch(ctx, opts)
		if err != nil {
			continue
		}

		for event := range w.ResultChan() {
			pod, ok := event.Object.(*corev1.Pod)
			if !ok {
				continue
			}

			switch event.Type {
			case watch.Added, watch.Modified:
				if pod.Status.Phase != corev1.PodRunning {
					continue
				}
				d.updatePod(pod)
			case watch.Deleted:
				d.removePod(pod)
			}
		}
	}
}

func (d *Discoverer) updatePod(pod *corev1.Pod) {
	d.mu.Lock()
	defer d.mu.Unlock()

	for _, container := range pod.Spec.Containers {
		for _, port := range container.Ports {
			ip := pod.Status.PodIP
			if ip != "" {
				d.ipMap[ip] = ipMeta{
					Name:      pod.Name,
					Namespace: pod.Namespace,
					Port:      port.ContainerPort,
					Labels:    pod.Labels,
				}
			}
		}
	}

	if pod.Status.PodIP != "" {
		d.ipMap[pod.Status.PodIP] = ipMeta{
			Name:      pod.Name,
			Namespace: pod.Namespace,
			Port:      0,
			Labels:    pod.Labels,
		}
	}
}

func (d *Discoverer) removePod(pod *corev1.Pod) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if pod.Status.PodIP != "" {
		delete(d.ipMap, pod.Status.PodIP)
	}
}

func (d *Discoverer) watchServices(ctx context.Context) {
	for {
		select {
		case <-d.done:
			return
		default:
		}

		w, err := d.clientset.CoreV1().Services("").Watch(ctx, metav1.ListOptions{})
		if err != nil {
			continue
		}

		for event := range w.ResultChan() {
			svc, ok := event.Object.(*corev1.Service)
			if !ok {
				continue
			}

			switch event.Type {
			case watch.Added, watch.Modified:
				d.updateService(svc)
			case watch.Deleted:
				d.removeService(svc)
			}
		}
	}
}

func (d *Discoverer) updateService(svc *corev1.Service) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if svc.Spec.ClusterIP != "" && svc.Spec.ClusterIP != "None" {
		for _, port := range svc.Spec.Ports {
			d.ipMap[svc.Spec.ClusterIP] = ipMeta{
				Name:      svc.Name,
				Namespace: svc.Namespace,
				Port:      port.Port,
				Labels:    svc.Labels,
			}
		}
	}
}

func (d *Discoverer) removeService(svc *corev1.Service) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if svc.Spec.ClusterIP != "" && svc.Spec.ClusterIP != "None" {
		delete(d.ipMap, svc.Spec.ClusterIP)
	}
}

func (d *Discoverer) watchEndpoints(ctx context.Context) {
	for {
		select {
		case <-d.done:
			return
		default:
		}

		w, err := d.clientset.CoreV1().Endpoints("").Watch(ctx, metav1.ListOptions{})
		if err != nil {
			continue
		}

		for event := range w.ResultChan() {
			ep, ok := event.Object.(*corev1.Endpoints)
			if !ok {
				continue
			}

			switch event.Type {
			case watch.Added, watch.Modified:
				d.updateEndpoints(ep)
			case watch.Deleted:
				d.removeEndpoints(ep)
			}
		}
	}
}

func (d *Discoverer) updateEndpoints(ep *corev1.Endpoints) {
	d.mu.Lock()
	defer d.mu.Unlock()

	for _, subset := range ep.Subsets {
		for _, addr := range subset.Addresses {
			for _, port := range subset.Ports {
				d.ipMap[addr.IP] = ipMeta{
					Name:      ep.Name,
					Namespace: ep.Namespace,
					Port:      port.Port,
					Labels:    ep.Labels,
				}
			}
		}
	}
}

func (d *Discoverer) removeEndpoints(ep *corev1.Endpoints) {
	d.mu.Lock()
	defer d.mu.Unlock()

	for _, subset := range ep.Subsets {
		for _, addr := range subset.Addresses {
			delete(d.ipMap, addr.IP)
		}
	}
}
